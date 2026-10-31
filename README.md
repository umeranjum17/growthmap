# growthmap

Reverse-engineer how an app is marketed and distributed.

Give it one app. Get back the channels that app used, the dated moves it made, the positioning it holds, and the plays worth copying.

Every claim carries a label. **Seen** means the run fetched the evidence and the link is in the report. **Inferred** means a judgement drawn from those Seen records, with the records cited. A claim with no label is not printed.

Every run prints what each data call cost and the total at the end. The base run reads public pages only. No paid key, no account, no subscription.

Live page: <https://umeranjum17.github.io/growthmap/>

## Status: slices 1 to 4c, the tool, the playbook and the live landing page

Four commands run today. `growthmap run` reads the target app's own public pages, dates each of them from the public web archive and from the pages `/sitemap.xml` advertises, searches Hacker News, Reddit and YouTube for the app, reads its App Store and Google Play listings and the careers page on its own host, and writes a report where every claim is either Seen, with a link the run fetched, or Inferred, with the Seen ids it stands on; a page that refused the fetch is named under `## Not read` and carries no claim, and that run exits non-zero. `growthmap playbook` hands that report to your own agent and takes the plays back, refusing any play that cites evidence the run never saw. `growthmap sources` prints every source a run can read, what a call costs and whether it needs a key, so the price is known before the first run. `growthmap doctor` says what is missing on this machine before you start, and exits non-zero when something is.

## Usage

Run it straight from the repository with Node 20 or newer, no install step:

```sh
node bin/growthmap.js doctor                            # what is missing before a run
node bin/growthmap.js sources                           # every source, its cost, whether it needs a key
node bin/growthmap.js run example.com --out report
node bin/growthmap.js run example.com --out report --as-of 2026-01-15
```

`--as-of` pins the date the run records for the pages and facts it reads, instead of today's date.

It writes `report.md` (the human report), `report.json` (the same claims as records, plus the run metadata) and `costs.json` (every call and the total) into the directory.

## The playbook: your agent writes it, the tool checks it

```sh
node bin/growthmap.js playbook report                          # writes report/playbook-prompt.md
node bin/growthmap.js playbook report --accept plays.json
```

The first command writes the brief: the app, the run date, every Seen record with its id, its claim, its url and its quote, the exact JSON shape to return, and the rule that every play must cite a Seen id from this run. Hand it to your own agent, which writes `plays.json`. The second command checks the answer and writes it into `report.md` as a `## Playbook` section; it refuses, and writes nothing, when a play cites an id this run never saw, cites none at all, or is missing its title, its effort, its first result or its prompt. No model call and no key are inside the tool.

`examples/plausible.io/` is one complete real run against Plausible Analytics, with the brief and the plays written from it. `examples/linear.app/` is a second real run: its report and its cost file, quoted on the landing page.

## What a report will hold

- **The growth curve.** What moved, by how much, and when.
- **A dated timeline.** Every page the site advertises, with the day the public web archive first recorded it and a link you can open to the capture.
- **Reach.** Where the app is talked about away from its own site: Hacker News stories, Reddit posts, YouTube videos, the App Store and Google Play listings, and the roles open on its careers page, each with a link, the counts the source itself states, and the date the run read it, plus one Inferred line counting the channels found.
- **The positioning.** What the app claims, who it claims it for, and what it charges.
- **A playbook.** Each play with its effort, its first result, a ready prompt you can hand to an agent, and the Seen ids it rests on.
- **The cost table.** Every source call, its price, and the total for the run.

## Two rules that never bend

1. **Seen or Inferred, never bare.** Evidence and judgement are kept apart, so you can check every line yourself by opening its link.
2. **The run shows its cost.** Free sources print as free. Anything that costs money prints its price before it is spent. A run that cannot price a call does not make that call.

## Built for people and for agents

growthmap is a command line tool with plain text for a person and structured output for an agent, so the same run can be read by you and driven by your own assistant. The skill an agent loads to drive it ships in this repository at `skills/growthmap-reverse`, and is published with the package.

## Bring your own AI

The reading and the writing of the report run on the agent or subscription you already have. No key ships with this tool and no vendor is required.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).

Follow [@umership](https://x.com/umership) on X.
