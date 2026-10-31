#!/usr/bin/env node
// growthmap: one command that reads an app's own public pages and reports
// every line as Seen (with the link and quote) or Inferred (with cited ids).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSite, getText } from '../src/site.js';
import { fetchSitemap } from '../src/sitemap.js';
import { archiveDates } from '../src/archive.js';
import { fetchReach, hnUrl, redditUrl } from '../src/reach.js';
import { fetchExtraSources } from '../src/sources.js';
import { buildReport, renderMarkdown } from '../src/report.js';
import { acceptPlays, playbookPrompt, seenRecords, withPlaybook } from '../src/playbook.js';
import { SOURCES } from '../src/registry.js';
import { setAsOf } from '../src/today.js';

const DEFAULT_OUT = 'growthmap-out';

const USAGE = `growthmap — read an app's public pages, label every claim.

Usage:
  growthmap run <app-url-or-host> [--out <dir>] [--as-of YYYY-MM-DD]
  growthmap playbook <report-dir> [--accept <plays.json>]
  growthmap sources
  growthmap doctor
  growthmap --help

Reads the homepage and /pricing, /about, /features when they answer.
Dated each page from the public web archive, plus the pages /sitemap.xml advertises.
Searches Hacker News and Reddit for the app's own address, YouTube for its name,
and reads the App Store and Google Play listings and the app's own careers page.
Writes report.md, report.json and costs.json into <dir> (default: growthmap-out).

--as-of pins the date the run records for the pages and facts it reads, instead
of today's date.

playbook writes playbook-prompt.md for your own agent to answer as plays.json;
--accept checks that answer against the run's Seen records and writes it into
report.md. A play that cites evidence this run never saw is refused.

sources lists every source a run can read, one row each: what it costs and
whether it needs a key.

doctor says what is missing on this machine before a run: Node 20 or newer, one
public host answering, and whether the output directory can be written. It
exits non-zero when something is missing.`;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD, not just that shape. */
const isDate = (text) => DATE_SHAPE.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

/** Every source, its price and whether it needs a key: one row each. */
function sourcesCommand() {
  const rows = [
    ['source', 'cost', 'needs a key'],
    ...SOURCES.map((source) => [source.name, source.cost.toFixed(2), source.needsKey ? 'yes' : 'no']),
  ];
  const width = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) {
    console.log(row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(width[column] + 2))).join('').trimEnd());
  }
  return 0;
}

/** What is missing before a run: one plain line per check, non-zero if any is. */
async function doctorCommand() {
  const checks = [];

  const major = Number(process.versions.node.split('.')[0]);
  checks.push([
    major >= 20,
    major >= 20
      ? `Node ${process.versions.node} is 20 or newer`
      : `Node ${process.versions.node} is older than 20, growthmap needs 20 or newer`,
  ]);

  const answered = await getText('https://example.com', 'text/html');
  const online = answered.status === 'ok' || Number(answered.http_status) > 0;
  checks.push([
    online,
    online ? 'reached example.com over the network' : `could not reach example.com (${answered.status})`,
  ]);

  let writable = true;
  try {
    await mkdir(DEFAULT_OUT, { recursive: true });
    const probe = join(DEFAULT_OUT, `.doctor-${process.pid}`);
    await writeFile(probe, 'growthmap doctor\n', 'utf8');
    await rm(probe);
  } catch {
    writable = false;
  }
  checks.push([writable, writable ? `${DEFAULT_OUT}/ can be written` : `${DEFAULT_OUT}/ cannot be written here`]);

  for (const [passes, line] of checks) console.log(`${passes ? 'ok     ' : 'missing'}  ${line}`);
  return checks.every(([passes]) => passes) ? 0 : 1;
}

function parsePlaybookArgs(rest) {
  let dir;
  let accept;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--accept') {
      accept = rest[i + 1];
      i += 1;
      if (!accept) return { error: '--accept needs a plays file' };
    } else if (arg.startsWith('--accept=')) {
      accept = arg.slice('--accept='.length);
      if (!accept) return { error: '--accept needs a plays file' };
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` };
    } else if (dir === undefined) {
      dir = arg;
    } else {
      return { error: `unexpected argument: ${arg}` };
    }
  }
  if (!dir) return { error: 'missing <report-dir>' };
  return { command: 'playbook', dir, accept };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || ['--help', '-h', 'help'].includes(command)) return { help: true };
  if (command === 'playbook') return parsePlaybookArgs(rest);
  if (command === 'sources' || command === 'doctor') {
    if (rest.length > 0) return { error: `unexpected argument: ${rest[0]}` };
    return { command };
  }
  if (command !== 'run') return { error: `unknown command: ${command}` };

  let target;
  let out = DEFAULT_OUT;
  let asOf;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--out') {
      out = rest[i + 1];
      i += 1;
      if (!out) return { error: '--out needs a directory' };
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
      if (!out) return { error: '--out needs a directory' };
    } else if (arg === '--as-of') {
      asOf = rest[i + 1];
      i += 1;
      if (!asOf) return { error: '--as-of needs a date like 2026-01-15' };
    } else if (arg.startsWith('--as-of=')) {
      asOf = arg.slice('--as-of='.length);
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` };
    } else if (target === undefined) {
      target = arg;
    } else {
      return { error: `unexpected argument: ${arg}` };
    }
  }
  if (!target) return { error: 'missing <app-url-or-host>' };
  if (asOf !== undefined && !isDate(asOf)) {
    return { error: `--as-of "${asOf}" is not a date; use YYYY-MM-DD, for example 2026-01-15` };
  }
  return { command: 'run', target, out, asOf };
}

async function readJson(path, what) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`could not read ${path}; ${what}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error.message})`);
  }
}

/** The playbook half: write the brief, or check the answer and take it back. */
async function playbookCommand(args) {
  const reportJson = join(args.dir, 'report.json');
  let report;
  try {
    report = await readJson(reportJson, 'run growthmap run first, it writes one');
  } catch (error) {
    console.error(`growthmap: ${error.message}`);
    return 2;
  }

  if (!args.accept) {
    const seen = seenRecords(report);
    if (seen.length === 0) {
      console.error(`growthmap: ${reportJson} holds no Seen records, so there is no playbook to brief for.`);
      return 2;
    }
    const path = join(args.dir, 'playbook-prompt.md');
    await writeFile(path, playbookPrompt(report), 'utf8');
    console.log(`wrote ${path} (${seen.length} Seen records to work from)`);
    console.log(`hand it to your agent, then: growthmap playbook ${args.dir} --accept plays.json`);
    return 0;
  }

  const reportMd = join(args.dir, 'report.md');
  let markdown;
  try {
    markdown = await readFile(reportMd, 'utf8');
  } catch {
    console.error(`growthmap: could not read ${reportMd}; the plays have nowhere to go, nothing written.`);
    return 2;
  }

  let playsText;
  try {
    playsText = await readFile(args.accept, 'utf8');
  } catch {
    console.error(`growthmap: could not read ${args.accept}; nothing written.`);
    return 2;
  }

  const seenIds = new Set(seenRecords(report).map((claim) => claim.id));
  const answer = acceptPlays(playsText, seenIds);
  if (answer.error) {
    console.error(`growthmap: ${args.accept} refused: ${answer.error}. Nothing written to ${reportMd}.`);
    return 2;
  }

  await writeFile(reportMd, withPlaybook(markdown, answer.plays), 'utf8');
  console.log(`accepted ${answer.plays.length} play(s) into ${reportMd}`);
  return 0;
}

function toUrl(target) {
  const candidate = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  try {
    const url = new URL(candidate);
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`growthmap: ${args.error}\n\n${USAGE}`);
    return 2;
  }

  if (args.command === 'playbook') return playbookCommand(args);
  if (args.command === 'sources') return sourcesCommand();
  if (args.command === 'doctor') return doctorCommand();

  const url = toUrl(args.target);
  if (!url) {
    console.error(`growthmap: "${args.target}" is not a URL or host`);
    return 2;
  }

  // Pinned before any fetch, so every page and fact the run records carries it.
  if (args.asOf) setAsOf(args.asOf);

  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const started_at = new Date().toISOString();
  const { pages, costLines } = await fetchSite(url.origin);

  const home = pages.find((page) => page.kind === 'homepage');
  if (home?.status !== 'ok') {
    console.error(`growthmap: could not read ${home?.url ?? url.href} (${home?.status ?? 'unknown'}); no report written.`);
    return 1;
  }

  // The sitemap advertises more pages; dedupe against the pages already read so
  // no URL is asked for twice. Archive dates are asked last, page URLs first.
  const sitemap = await fetchSitemap(url.origin);
  const sitemapCostLines = sitemap.costLines;
  const siteUrls = pages.filter((page) => page.status === 'ok').map((page) => page.url);
  const archive = await archiveDates([...new Set([...siteUrls, ...sitemap.urls])]);
  const archiveCostLines = archive.costLines;

  // Reach: the app as other people wrote it down. The search is the app's own
  // address, because a brand word alone matches whatever shares the word. The
  // brand token is the host's own label, or the site's own title when the host
  // has no name of its own (a bare IP).
  const appHost = url.hostname.replace(/^www\./i, '');
  const hostLabel = appHost.split('.')[0];
  const brand = /^[a-z]{3,}$/i.test(hostLabel)
    ? hostLabel
    : ((home.title ?? '').split(/[\s\u2013\u2014:|\u00b7-]+/).filter(Boolean)[0] || hostLabel);
  const reach = await fetchReach([
    { source: 'hackernews', url: hnUrl(appHost), host: appHost, brand },
    { source: 'reddit', url: redditUrl(appHost), host: appHost, brand },
  ]);
  // The rest of reach: video, the store listings, and the roles the app is hiring.
  const extra = await fetchExtraSources({ origin: url.origin, host: appHost, brand, sitemapUrls: sitemap.urls });
  const outside = {
    items: [...reach.items, ...extra.items],
    sources: [...reach.sources, ...extra.sources],
    calls: [...reach.calls, ...extra.calls],
    attempts: reach.attempts + extra.attempts,
    stopped: reach.stopped ?? extra.stopped,
  };

  const report = buildReport({
    target: url.href,
    host: url.host,
    version,
    pages,
    archive,
    sitemap: { status: sitemap.status, urls: sitemap.urls.length },
    reach: outside,
    costLines: [...costLines, ...sitemapCostLines, ...archiveCostLines, ...reach.costLines, ...extra.costLines],
    started_at,
    finished_at: new Date().toISOString(),
  });

  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'report.md'), renderMarkdown(report), 'utf8');
  await writeFile(
    join(args.out, 'report.json'),
    `${JSON.stringify({ run: report.run, claims: report.claims }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(args.out, 'costs.json'), `${JSON.stringify(report.costs, null, 2)}\n`, 'utf8');

  for (const line of report.costs.lines) {
    console.log(`${line.source}\t${line.call}\t${line.cost.toFixed(2)}`);
  }
  console.log(`total\t${report.costs.total.toFixed(2)} USD`);
  console.log(`wrote ${join(args.out, 'report.md')}, report.json, costs.json`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
