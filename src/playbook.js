// The playbook: the hand-off to the reader's own agent, in two halves.
// `playbookPrompt` writes the brief the agent reads; `acceptPlays` checks the
// agent's answer and writes it into the report. The tool writes no play itself
// and calls no model, so the only thing keeping an answer honest is the check
// that every play cites a Seen record this run actually collected.
import { SEEN } from './claim.js';

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

const FIELDS = [
  ['title', 'title'],
  ['effort', 'effort'],
  ['first_result', 'first result'],
  ['prompt', 'prompt'],
];

/** The Seen records a brief is built from, in report order. */
export const seenRecords = (report) =>
  (report.claims ?? []).filter((claim) => claim.label === SEEN);

/**
 * The brief a person hands to their own agent: the instruction, the app, the
 * run date, every Seen record, the shape to return and the name to write.
 * Deterministic: the same report yields the same bytes.
 * @param {{run: object, claims: object[]}} report one report.json, as read
 */
export function playbookPrompt(report) {
  const run = report.run ?? {};
  const app = run.host || run.target || 'this app';
  const day = String(run.finished_at ?? run.started_at ?? '').slice(0, 10);
  const lines = [
    `# growthmap playbook brief: ${app}`,
    '',
    `App: ${app} (${run.target ?? app}). Run date: ${day}.`,
    '',
    '## Your instruction',
    '',
    `Write the playbook for ${app} from the evidence a growthmap run fetched on ${day}.`,
    'A play is a move this app made, written so the reader can copy it for their own app.',
    '',
    'Work only from the Seen records below. Do not add a fact, a link, a name, a count or a',
    'date that is not in one of them. Do not search the web and do not use anything you',
    'already know. If the evidence does not support a play, leave that play out; fewer true',
    'plays are better than one invented.',
    '',
    'Every play names what it costs, the first result the reader should expect to see if it',
    'works, and a ready prompt the reader can hand to their own agent. Order the plays by',
    'what is worth doing first.',
    '',
    '## What to write',
    '',
    'Write exactly one file named plays.json next to this brief, and nothing else.',
    '',
    '## The exact shape to return',
    '',
    '```json',
    '{',
    '  "plays": [',
    '    {',
    '      "title": "one line naming the play",',
    '      "effort": "what it costs and who does it, in plain words",',
    '      "first_result": "the first thing the reader should see if it works",',
    '      "prompt": "a ready prompt, in the imperative, to hand to the reader\'s own agent",',
    '      "cites": ["s1", "s3"]',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '- `title`: one line, the move itself, not the outcome it chases.',
    '- `effort`: hours or days and who does it. Never a bare number.',
    '- `first_result`: the first visible sign the play worked. Something checkable.',
    '- `prompt`: the words the reader pastes into their agent to start the play.',
    '- `cites`: the Seen ids from this run that the play rests on.',
    '',
    '## The rule that decides whether your answer is accepted',
    '',
    'Every play must cite at least one Seen id from this run, and every id it cites must be',
    'one of the Seen ids printed below. growthmap refuses the whole file if a play cites an',
    'id that is not below, or cites none at all. It also refuses a play that is missing its',
    'title, its effort, its first result or its prompt, and it refuses a file that is not',
    'JSON or holds no plays. Write it in the shape above and it is accepted.',
    '',
    '## The Seen records from this run',
    '',
  ];

  const seen = seenRecords(report);
  if (seen.length === 0) lines.push('The run collected no Seen records, so there is nothing to write from.');
  for (const claim of seen) {
    lines.push(`### ${claim.id}`, '', `claim: ${oneLine(claim.claim)}`);
    for (const entry of claim.evidence ?? []) {
      lines.push(`url: ${entry.url}`, `quote: ${oneLine(entry.quote)}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Read the agent's answer. Returns the clean plays, or the one reason the
 * whole file is refused. Nothing is written by this function.
 * @param {string} text the file as the agent wrote it
 * @param {Set<string>} seenIds the Seen ids this report holds
 */
export function acceptPlays(text, seenIds) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { error: `the file is not valid JSON (${error.message})` };
  }

  const plays = data?.plays;
  if (!Array.isArray(plays)) return { error: 'the file holds no plays: expected {"plays": [...]}' };
  if (plays.length === 0) return { error: 'the file holds no plays' };

  const clean = [];
  for (const [index, play] of plays.entries()) {
    const where = `play ${index + 1}`;
    if (!play || typeof play !== 'object' || Array.isArray(play)) {
      return { error: `${where} is not an object` };
    }
    for (const [key, label] of FIELDS) {
      if (!isText(play[key])) return { error: `${where} has no ${label}` };
    }
    const cites = Array.isArray(play.cites) ? play.cites.map((ref) => String(ref).trim()).filter(Boolean) : [];
    if (cites.length === 0) return { error: `${where} cites no Seen id` };
    for (const ref of cites) {
      if (!seenIds.has(ref)) {
        return { error: `${where} cites "${ref}", which is not a Seen record in this report` };
      }
    }
    clean.push({
      title: play.title.trim(),
      effort: play.effort.trim(),
      first_result: play.first_result.trim(),
      prompt: play.prompt.trim(),
      cites,
    });
  }

  return { plays: clean };
}

/** The `## Playbook` section, one block per play. */
export function renderPlaybook(plays) {
  const lines = [
    '## Playbook',
    '',
    'Each play rests on Seen records from this run; the ids it cites are named under it.',
    '',
  ];
  for (const [index, play] of plays.entries()) {
    lines.push(
      `### ${index + 1}. ${oneLine(play.title)}`,
      '',
      `**Effort:** ${oneLine(play.effort)}`,
      '',
      `**First result:** ${oneLine(play.first_result)}`,
      '',
      '**Prompt:**',
      '',
      play.prompt.trim(),
      '',
      `*Seen:* ${play.cites.join(', ')}`,
      '',
    );
  }
  return lines.join('\n').trimEnd();
}

/** The report with its Playbook section replaced or appended, at the end. */
export function withPlaybook(markdown, plays) {
  const base = markdown.replace(/\n## Playbook\n[\s\S]*$/, '').replace(/\s+$/, '');
  return `${base}\n\n${renderPlaybook(plays)}\n`;
}
