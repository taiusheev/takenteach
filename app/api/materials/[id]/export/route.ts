import { NextRequest, NextResponse } from "next/server";
import { commonFields } from "@/lib/content-types";
import { contentToMarkdown, markdownToPlainText } from "@/lib/export-pack";
import { loadMaterial } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/** Formats the server can produce from the stored content. */
const FORMATS = {
  md: { ext: "md", type: "text/markdown; charset=utf-8" },
  txt: { ext: "txt", type: "text/plain; charset=utf-8" },
  json: { ext: "json", type: "application/json; charset=utf-8" },
} as const;
type Format = keyof typeof FORMATS;

/** A filename a coach can find later: "L5-crossfire-questions-that-corner.md". */
function fileName(code: string, title: string, ext: string): string {
  const slug = `${code} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return `${slug || "lesson"}.${ext}`;
}

/**
 * Download a material as a text-shaped file. The visual formats (PDF, HTML,
 * Word) are produced in the browser from the rendered print view, because their
 * whole point is the design — only these text ones can be generated from the
 * stored JSON.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/export">
) {
  const found = await loadMaterial(ctx);
  if (!found.ok) return found.response;
  const { material } = found;

  const raw = req.nextUrl.searchParams.get("format") ?? "md";
  const format = (raw in FORMATS ? raw : "md") as Format;
  // The student copy must not carry the answer key; teacher copy is opt-in.
  const withAnswers = req.nextUrl.searchParams.get("answers") === "1";

  const body =
    format === "json"
      ? JSON.stringify(material.content, null, 2)
      : (() => {
          const md = contentToMarkdown(material.type, material.content, {
            withAnswers,
          });
          return format === "txt" ? markdownToPlainText(md) : md;
        })();

  const c = commonFields(material.content);
  const name = fileName(
    c.lessonCode || "",
    c.title || material.title,
    FORMATS[format].ext
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": FORMATS[format].type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
