import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { toPositional, all, one, insert, run, exec, transaction, closeDb } from "./pg";

/**
 * The Postgres layer's own tests.
 *
 * `toPositional` rewrites every query the application makes, so a bug in it is
 * a bug everywhere at once — and the failure mode is not a crash but a query
 * that silently binds the wrong parameter to the wrong column. That deserves
 * direct tests rather than being exercised incidentally.
 *
 * The rest runs against PGlite, in-process, so the suite stays offline.
 */

describe("toPositional", () => {
  test("numbers placeholders in order", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE a = ? AND b = ?"),
      "SELECT * FROM t WHERE a = $1 AND b = $2"
    );
  });

  test("leaves a query with no placeholders alone", () => {
    assert.equal(toPositional("SELECT 1"), "SELECT 1");
  });

  test("ignores a ? inside a string literal", () => {
    // The real hazard: a LIKE pattern or a message column containing a question
    // mark would otherwise consume a parameter position and shift every
    // placeholder after it by one — silently.
    assert.equal(
      toPositional("SELECT * FROM t WHERE note = 'why?' AND id = ?"),
      "SELECT * FROM t WHERE note = 'why?' AND id = $1"
    );
  });

  test("handles an escaped quote inside a string", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE s = 'it''s ok?' AND id = ?"),
      "SELECT * FROM t WHERE s = 'it''s ok?' AND id = $1"
    );
  });

  test("numbers across newlines, as the real queries are written", () => {
    assert.equal(
      toPositional(`SELECT *
         FROM materials
        WHERE org_id = ?
          AND status = ?`).match(/\$\d/g)?.join(","),
      "$1,$2"
    );
  });
});

describe("the driver, against PGlite", () => {
  after(async () => {
    await closeDb();
  });

  test("creates, inserts and reads back", async () => {
    await exec(`CREATE TABLE widgets (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL,
      org_id bigint NOT NULL
    )`);

    const id = await insert(
      "INSERT INTO widgets (name, org_id) VALUES (?, ?)",
      ["first", 1]
    );
    assert.ok(id > 0, "insert() must return the new id");

    const row = await one<{ name: string }>(
      "SELECT name FROM widgets WHERE id = ?",
      [id]
    );
    assert.equal(row?.name, "first");
  });

  test("parameters bind in the right order", async () => {
    // Two params of the same type in a query where a swap would still run —
    // exactly the bug a placeholder converter can introduce and a smoke test
    // would not catch.
    await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["second", 2]);
    const rows = await all<{ name: string; org_id: string }>(
      "SELECT name, org_id FROM widgets WHERE org_id = ? AND name = ?",
      [2, "second"]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "second");
  });

  test("run() reports rows affected", async () => {
    const n = await run("UPDATE widgets SET name = ? WHERE org_id = ?", ["renamed", 1]);
    assert.equal(n, 1);
  });

  test("a transaction commits as one unit", async () => {
    await transaction(async () => {
      await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["tx-a", 9]);
      await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["tx-b", 9]);
    });
    const rows = await all("SELECT id FROM widgets WHERE org_id = ?", [9]);
    assert.equal(rows.length, 2);
  });

  test("a failed transaction rolls the whole thing back", async () => {
    await assert.rejects(
      transaction(async () => {
        await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["doomed", 10]);
        // NOT NULL violation, thrown by the database rather than by the test —
        // so this exercises the real rollback path.
        await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", [null, 10]);
      })
    );
    const rows = await all("SELECT id FROM widgets WHERE org_id = ?", [10]);
    assert.equal(rows.length, 0, "the first insert survived a rolled-back transaction");
  });

  test("nested transactions join the outer one", async () => {
    await assert.rejects(
      transaction(async () => {
        await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["outer", 11]);
        await transaction(async () => {
          await insert("INSERT INTO widgets (name, org_id) VALUES (?, ?)", ["inner", 11]);
        });
        throw new Error("boom");
      }),
      /boom/
    );
    const rows = await all("SELECT id FROM widgets WHERE org_id = ?", [11]);
    assert.equal(rows.length, 0, "the inner insert was not rolled back with the outer");
  });
});
