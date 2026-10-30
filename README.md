# growthmap

Reverse-engineer how an app is marketed and distributed.

Give it one app. Get back the channels that app used, the dated moves it made, the positioning it holds, and the plays worth copying.

Every claim carries a label. **Seen** means the run fetched the evidence and the link is in the report. **Inferred** means a judgement drawn from those Seen records, with the records cited. A claim with no label is not printed.

Every run prints what each data call cost and the total at the end. The base run reads public pages only. No paid key, no account, no subscription.

## Status: early, pre-release

The command line interface is being designed. There is no install step yet. Read everything below as the shape of the tool, not as a promise that it runs today.

## What a report will hold

- **The growth curve.** What moved, by how much, and when.
- **A dated timeline of the channels.** Page launches, pricing changes, comparison pages, new languages, community posts, store presence, hiring.
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
