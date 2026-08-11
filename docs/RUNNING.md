# Running Ascent — free, forever, for one user

**The short version:** don't host it. Run it on your own machine as a proper
always-on app. It costs nothing, it's faster than any free tier, your data never
leaves the laptop, and none of the hosting constraints apply.

The only thing you pay for is the AI itself (~$0.60–1.30 a lesson), and that is
unavoidable wherever the site runs.

---

## Set it up once

```
1. Double-click   scripts\ascent.bat
2. Open           http://localhost:3000
```

That's it. The first launch builds the site if it hasn't been built (about a
minute); after that it's ready in well under a second.

### Make it start by itself

So the site is simply always there after you log in, with no window in the way:

1. Press **Win + R**, type `shell:startup`, press Enter.
2. Right-drag `scripts\ascent-hidden.vbs` into that folder → **Create shortcut**.

Now `http://localhost:3000` works from the moment you log in. Bookmark it.

**To stop it:** Task Manager → Details → end `node.exe`. Or reboot.

### After the code changes

A production build is a snapshot, so it doesn't pick up edits by itself. Run
`scripts\ascent-rebuild.bat` once and you're current again.

---

## Back up the library

Every lesson pack, design, student observation and judged round lives in a
single file: `data\ascent.db`. Running locally means **that file is the only
copy in existence.**

```
node scripts/backup.mjs
```

Writes a timestamped snapshot to `backups\`, keeps the last 20. Point it
somewhere synced and you have off-machine copies for free:

```
node scripts/backup.mjs "C:\Users\<you>\OneDrive\ascent-backups"
```

This uses SQLite's `VACUUM INTO`, not a file copy — the database runs in WAL
mode, so copying `ascent.db` while the site is running can silently miss the
most recent edits. Worth running weekly, and before anything drastic.

---

## Showing it to someone else

Because it's on `localhost`, only you can reach it — which is exactly why it
needs no login. For a demo you have two good options:

**Screen-share.** Nothing to set up, nothing exposed. Best default.

**A temporary public link** (free, no account):

```
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

That prints a `https://something.trycloudflare.com` URL that works from
anywhere for as long as the command runs. Press Ctrl+C to kill it.

> ⚠️ **That URL is public and has no password.** Anyone who has it can use the
> site and spend your API credits. Start it for the demo, stop it straight
> after. Don't leave it running, and don't put it in a message thread that
> outlives the call.

---

## Why not a free cloud host?

Worth writing down, because the obvious answers all fail for specific reasons:

| Option | Why it doesn't work here |
|---|---|
| **Vercel / Netlify** free | A lesson build runs 7–15 minutes. Their free function timeouts are measured in seconds. The flagship feature cannot finish. |
| **Render** free | Free web services get no persistent disk, and the instance sleeps after 15 minutes idle. `ascent.db` would be wiped on every restart — you'd lose the whole library. |
| **Google Cloud Run** free | Generous timeout, but no persistent filesystem. Would need Postgres instead of SQLite — a real migration, and then it isn't free either. |
| **Railway / Fly.io** | Both want a card; the genuinely free allowances no longer cover an always-on machine with a volume. |
| **Oracle Cloud Always Free** | Actually works — a real VM, free indefinitely. But it's a Linux server you now administer: firewall, TLS, updates, deploys. Worth it only if you need it reachable 24/7 without your laptop. |

The pattern: everything free is either **serverless** (too short for a 9-minute
build) or **ephemeral** (loses the SQLite file). Your machine is neither.

---

## When to stop running it locally

Move to a real host when one of these becomes true — not before:

- **Someone other than you needs it**, on their own schedule. That's the real
  trigger, and it brings a login screen with it: right now there's no
  authentication at all, which is fine on localhost and not fine on the open
  internet.
- **You want overnight batch builds to run while the laptop is shut.** The
  overnight queue (`POST /api/overnight`) needs the process alive to poll.
- **The library becomes something the academy depends on**, at which point one
  laptop holding the only copy is the problem, not the hosting bill.

At that point the answer is a small always-on box with a disk (~$5/month) plus
a password gate — both quick, and both worth doing properly rather than early.
