# growthmap

Reverse-engineer how an app is marketed and distributed.

Give it one app. Get back the channels that app used, the dated moves it made, the positioning it holds, and the plays worth copying.

Every claim carries a label. **Seen** means the run fetched the evidence and the link is in the report. **Inferred** means a judgement drawn from those Seen records, with the records cited. A claim with no label is not printed.

Every run prints what each data call cost and the total at the end. The base run reads public pages only. No paid key, no account, no subscription.

## Status: slice 3, reach from Hacker News, Reddit, YouTube, the stores and hiring

One command runs today. It reads the target app's own public pages, dates each of them from the public web archive and from the pages `/sitemap.xml` advertises, searches Hacker News, Reddit and YouTube for the app, reads its App Store and Google Play listings and the careers page on its own host, and writes a report where every line is either Seen, with a link the run fetched, or Inferred, with the Seen ids it stands on. The playbook and the landing page are later slices.

## Usage

Run it straight from the repository with Node 20 or newer, no install step:

```sh
node bin/growthmap.js run example.com --out report
```

It writes `report.md` (the human report), `report.json` (the same claims as records, plus the run metadata) and `costs.json` (every call and the total) into the directory.

## What a report will hold

- **The growth curve.** What moved, by how much, and when.
- **A dated timeline.** Every page the site advertises, with the day the public web archive first recorded it and a link you can open to the capture.
- **Reach.** Where the app is talked about away from its own site: Hacker News stories, Reddit posts, YouTube videos, the App Store and Google Play listings, and the roles open on its careers page, each with a link, the counts the source itself states, and the date the run read it, plus one Inferred line counting the channels found.
- **The positioning.** What the app claims, who it claims it for, and what it charges.
- **A playbook.** Each play with its effort, its first result, and a ready prompt you can hand to an agent.
- **The cost table.** Every source call, its price, and the total for the run.

## Two rules that never bend

1. **Seen or Inferred, never bare.** Evidence and judgement are kept apart, so you can check every line yourself by opening its link.
2. **The run shows its cost.** Free sources print as free. Anything that costs money prints its price before it is spent. A run that cannot price a call does not make that call.

## Built for people and for agents

growthmap is a command line tool with plain text for a person and structured output for an agent, so the same run can be read by you and driven by your own assistant.

## Bring your own AI

The reading and the writing of the report run on the agent or subscription you already have. No key ships with this tool and no vendor is required.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).

Follow [@umership](https://x.com/umership) on X.
