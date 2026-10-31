---
name: growthmap-reverse
description: >-
  Reverse-engineer how an app is marketed and distributed from its own public
  pages, the web archive and where other people talk about it, then write the
  plays worth copying for the reader's own app. Use when the user asks how a
  named app grew, wants the plays to copy from an app, or asks for a growth
  playbook built on fetched evidence. Drives the growthmap CLI and then writes
  the plays itself, because the tool calls no model.
---

# growthmap-reverse

Read one app's public footprint, label every line Seen or Inferred, then write a
playbook from the Seen records. The command line tool fetches and checks. The
writing is yours.

## When to use

Use when the user names an app and asks how it grew, what it did that worked, or
what to copy from it. Use it when they want a growth playbook, a channel list, a
positioning read or a dated timeline for an app they can point at by URL or host.

Do not use it for private data, for a paid source, or for an app the user cannot
name by URL. The tool reads public pages only: no key, no account, no model call.

## Procedure

Node 20 or newer. From a checkout, run `node bin/growthmap.js <args>`; installed,
the same args go to the `growthmap` binary. Every command below exists today:

```sh
growthmap run <app-url-or-host> [--out <dir>] [--as-of YYYY-MM-DD]
growthmap playbook <report-dir> [--accept <plays.json>]
growthmap sources
growthmap doctor
```

0. **Answer the two questions a reader asks first, before the first run.**

   ```sh
   node bin/growthmap.js sources   # every source, what a call costs, whether it needs a key
   node bin/growthmap.js doctor    # what is missing on this machine before a run
   ```

   `sources` prints one row per source the run can read, with its price and
   whether it needs a key. Every source is free today, so you can say what the
   run will cost before it spends anything. `doctor` prints one plain line per
   check — Node 20 or newer, one public host answering, the output directory
   writable — and exits non-zero when something is missing, so a stale Node or a
   dead network arrives as a sentence instead of a stack trace. If `doctor`
   fails, tell the user what it named and fix that before running.

1. **Fetch the run.**

   ```sh
   node bin/growthmap.js run <app-url-or-host> [--out <dir>] [--as-of YYYY-MM-DD]
   ```

   It reads the homepage and `/pricing`, `/about`, `/features` when they answer,
   dates each page from the public web archive plus the pages `/sitemap.xml`
   advertises, searches Hacker News and Reddit for the app's own address and
   YouTube for its name, and reads the App Store and Google Play listings and the
   app's careers page. It writes `report.md`, `report.json` and `costs.json` into
   `<dir>`, default `growthmap-out`, and prints the cost table and its total.
   `--as-of` pins the date the run records for the pages and facts it reads
   instead of today's date; a malformed value is refused before any fetch.
   Read `report.md` before writing anything: the Seen section carries the ids
   (`s1`, `s2`, ...), the quote, the link and the fetch date.

2. **Write the brief for yourself.**

   ```sh
   node bin/growthmap.js playbook <report-dir>
   ```

   That writes `<report-dir>/playbook-prompt.md`: the app, the run date, every
   Seen record with its id, claim, url and quote, the exact JSON shape to return,
   and the rule the answer is checked against. It prints how many Seen records
   there are to work from.

3. **Write `plays.json`.** This step is yours, not the tool's. Work only from the
   Seen records in the brief. Do not search the web and do not add a fact, link,
   name, count or date that is not in one of them. Each play needs a `title`, an
   `effort`, a `first_result`, a ready `prompt` and `cites`: the Seen ids from this
   run that it rests on. Fewer true plays beat one invented.

4. **Check the answer and write it in.**

   ```sh
   node bin/growthmap.js playbook <report-dir> --accept <plays.json>
   ```

   It checks every play against the run's Seen records and writes the
   `## Playbook` section at the end of `report.md`, replacing an earlier one. It
   refuses the whole file, writes nothing, and exits non-zero when a play cites an
   id this run never saw, cites none at all, or is missing its title, its effort,
   its first result or its prompt. On success it prints how many plays it
   accepted.

## The two rules that never bend

- **Seen or Inferred, never bare.** A Seen line carries the quote, the link and
  the fetch date the run itself collected. An Inferred line is a judgement and
  names the Seen ids it stands on. The run will not print a claim with neither
  label, and the playbook check will not accept a play that floats free of a
  Seen record.
- **The run shows its cost.** Every source call is printed with its price, free
  sources print as free, and the last line is the total in USD. `costs.json`
  holds the same table.

## What the tool does not do

- **No model call.** growthmap calls no model and needs no key. Steps 1, 2 and 4
  are fetch and check. The playbook exists only because you or the reader's own
  agent wrote it.
- **No fetch through a block.** If a site refuses a plain fetch, the run stops:
  it prints that it could not read the page and writes no report at all. There is
  no retry, no partial report and no fallback source. Say that plainly to the user
  and do not describe channels the run did not collect.

## Pitfalls

- Do not describe a blocked or empty source as coverage. A source that found
  nothing says so in the report and makes no claim.
- Do not restate an Inferred line as a fact from the site. Open its `from:` ids
  and keep the judgement visible.
- Do not hand-edit `report.md` outside the `## Playbook` section; rerunning
  `--accept` replaces that section and leaves the rest alone.
- Do not cite an id from another run. Ids are per run and a stale `plays.json`
  is refused.

## Verification

- `node bin/growthmap.js --help` prints every command and flag above, and the
  commands you used are the ones it prints.
- `report.md` holds a `## Cost` table and a `**Total: ... USD**` line.
- After `--accept`, `report.md` ends with `## Playbook`, and every id after each
  play's `*Seen:*` is a `"label": "seen"` claim id in `report.json`.
