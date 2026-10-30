#!/usr/bin/env node
// growthmap: one command that reads an app's own public pages and reports
// every line as Seen (with the link and quote) or Inferred (with cited ids).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSite } from '../src/site.js';
import { fetchSitemap } from '../src/sitemap.js';
import { archiveDates } from '../src/archive.js';
import { fetchReach, hnUrl, redditUrl } from '../src/reach.js';
import { fetchExtraSources } from '../src/sources.js';
import { buildReport, renderMarkdown } from '../src/report.js';

const USAGE = `growthmap — read an app's public pages, label every claim.

Usage:
  growthmap run <app-url-or-host> [--out <dir>]

Reads the homepage and /pricing, /about, /features when they answer.
Dated each page from the public web archive, plus the pages /sitemap.xml advertises.
Searches Hacker News and Reddit for the app's own address, YouTube for its name,
and reads the App Store and Google Play listings and the app's own careers page.
Writes report.md, report.json and costs.json into <dir> (default: growthmap-out).`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || ['--help', '-h', 'help'].includes(command)) return { help: true };
  if (command !== 'run') return { error: `unknown command: ${command}` };

  let target;
  let out = 'growthmap-out';
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--out') {
      out = rest[i + 1];
      i += 1;
      if (!out) return { error: '--out needs a directory' };
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
      if (!out) return { error: '--out needs a directory' };
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` };
    } else if (target === undefined) {
      target = arg;
    } else {
      return { error: `unexpected argument: ${arg}` };
    }
  }
  if (!target) return { error: 'missing <app-url-or-host>' };
  return { target, out };
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

  const url = toUrl(args.target);
  if (!url) {
    console.error(`growthmap: "${args.target}" is not a URL or host`);
    return 2;
  }

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
