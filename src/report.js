// Turns fetched pages into the report: claims first, then the cost table.
import { makeClaim, SEEN, INFERRED } from './claim.js';
import { archiveUrl, dateOf, recordedLine } from './archive.js';
import { REACH_LABEL } from './reach.js';

const round = (value) => Number(value.toFixed(2));
const quoted = (text) => `"${text}"`;
const trimPunctuation = (text) => text.replace(/[.!?]+$/, '').trim();
const KIND_LABEL = { homepage: 'Homepage', pricing: 'Pricing page', about: 'About page', features: 'Features page' };

function seenClaim(page, id) {
  const label = KIND_LABEL[page.kind] ?? page.kind;
  // Say where the quote came from: the page's own self-description, or its prose.
  const verb = page.quote_source === 'description' ? 'describes itself as' : 'states';
  return makeClaim({
    id,
    claim: `${label} ${verb}: ${quoted(trimPunctuation(page.quote))}.`,
    label: SEEN,
    evidence: [{ url: page.url, quote: page.quote, fetched_at: page.fetched_at, title: page.title, http_status: page.http_status }],
  });
}

/** Fixed rule: the positioning is the homepage lead plus the pricing framing. */
function positioningClaim(home, pricing, id, seenIds) {
  const parts = [`the homepage leads with ${quoted(trimPunctuation(home.quote))}`];
  if (pricing) parts.push(`the pricing page says ${quoted(trimPunctuation(pricing.quote))}`);
  return makeClaim(
    {
      id,
      claim: `Positioning: ${parts.join(', and ')}.`,
      label: INFERRED,
      inferred_from: [home.claim_id, ...(pricing ? [pricing.claim_id] : [])],
    },
    seenIds,
  );
}

/** Fixed rule: the price shape is what the pricing page literally lists. */
function priceShapeClaim(pricing, id, seenIds) {
  // A price needs a digit right after the symbol; a fragment of a longer number is not a price.
  const prices = [...new Set(pricing.text.match(/[$€£]\d[\d,]*(?:\.\d+)?(?![\d.])/g) ?? [])];
  const listed = prices.length > 8 ? `${prices.slice(0, 8).join(', ')} and ${prices.length - 8} more` : prices.join(', ');
  const mentionsFree = /\bfree\b/i.test(pricing.text);
  const free = mentionsFree ? ', and mentions a free option' : '';
  const shape = prices.length
    ? `the pricing page lists ${listed}${free}`
    : `the pricing page lists no numeric price${free}`;
  return makeClaim(
    { id, claim: `Price shape: ${shape}.`, label: INFERRED, inferred_from: [pricing.claim_id] },
    seenIds,
  );
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** One Seen claim per dated page: the day the archive first recorded it. */
function datedClaim(entry, page, id) {
  const label = page ? (KIND_LABEL[page.kind] ?? page.kind) : `Page ${pathOf(entry.url)}`;
  return makeClaim({
    id,
    claim: `${label} first seen in the archive on ${dateOf(entry.timestamp)}.`,
    label: SEEN,
    evidence: [
      {
        url: archiveUrl(entry.timestamp, entry.url),
        page_url: entry.url,
        quote: recordedLine(entry),
        fetched_at: entry.fetched_at,
      },
    ],
  });
}

/** Exact counts, never a rounded guess: how many pages, and how they cluster. */
function timelineClaim(timeline, id, seenIds) {
  const total = timeline.length;
  const earliest = timeline[0].date;
  const latest = timeline[total - 1].date;
  const months = new Map();
  for (const row of timeline) months.set(row.date.slice(0, 7), (months.get(row.date.slice(0, 7)) ?? 0) + 1);
  let busiestMonth = '';
  let busiest = 0;
  for (const [month, count] of months) {
    if (count > busiest) {
      busiest = count;
      busiestMonth = month;
    }
  }
  const cluster = busiest > 1 ? `, with ${busiest} first seen in ${busiestMonth}` : '';

  // Every number here is counted, never estimated: the total dated pages, the
  // distinct months that hold one, the earliest, the most recent.
  let claim;
  if (total === 1) claim = `Timeline: 1 dated page, first seen ${earliest}.`;
  else if (months.size === 1) claim = `Timeline: ${total} dated pages, all first seen in ${earliest.slice(0, 7)} (${earliest} to ${latest}).`;
  else claim = `Pages were first seen in ${months.size} different months: ${total} dated pages, the earliest ${earliest}, the most recent ${latest}${cluster}.`;

  return makeClaim(
    {
      id,
      claim,
      label: INFERRED,
      inferred_from: timeline.map((row) => row.claim_id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    },
    seenIds,
  );
}

/** One Seen claim per community item: the counts and date the API returned. */
function reachItemClaim(item, id) {
  const label = REACH_LABEL[item.source] ?? item.source;
  const where = item.subreddit ? ` in r/${item.subreddit}` : '';
  const counts = [];
  if (item.points !== undefined) counts.push(`${item.points} points`);
  if (item.comments !== undefined) counts.push(`${item.comments} comments`);
  const said = counts.length ? ` (${counts.join(', ')})` : '';
  const dated = item.date ? ` dated ${item.date}` : '';
  const evidence = { url: item.url, quote: item.quote, fetched_at: item.fetched_at };
  // The HN discussion page is where the counts live; the story link is the item itself.
  if (item.discussion_url) {
    evidence.url = item.discussion_url;
    evidence.page_url = item.url;
  }
  return makeClaim({
    id,
    claim: `${label} post ${quoted(item.title)}${where}${said}${dated}.`,
    label: SEEN,
    evidence: [evidence],
  });
}

/** Exact counts, never a rounded guess: how many items, and on which channel. */
function reachClaim(items, id, seenIds) {
  const counts = new Map();
  for (const item of items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  let busiest = '';
  let busiestCount = 0;
  for (const [source, count] of counts) {
    if (count > busiestCount) {
      busiest = source;
      busiestCount = count;
    }
  }
  const dated = items.filter((item) => item.date).map((item) => item.date).sort();
  const earliest = dated.length ? `, the earliest dated ${dated[0]}` : '';
  const channels = counts.size === 1 ? '1 channel' : `${counts.size} channels`;
  const noun = items.length === 1 ? 'item' : 'items';
  return makeClaim(
    {
      id,
      claim: `Reach: ${items.length} ${noun} across ${channels}, the busiest ${REACH_LABEL[busiest] ?? busiest} with ${busiestCount}${earliest}.`,
      label: INFERRED,
      inferred_from: items.map((item) => item.claim_id),
    },
    seenIds,
  );
}

/**
 * Build every claim and the cost total for one run.
 * @param {{target: string, host: string, pages: object[], costLines: object[], started_at: string, finished_at: string}} run
 */
export function buildReport(run) {
  const pages = run.pages;
  const byKind = (kind) => pages.find((page) => page.kind === kind && page.status === 'ok');

  const claims = [];
  const seenIds = new Set();
  for (const page of pages) {
    if (page.status !== 'ok') continue;
    const id = `s${claims.length + 1}`;
    claims.push(seenClaim(page, id));
    seenIds.add(id);
    page.claim_id = id;
  }

  // One Seen claim per page the archive could date, oldest first in the timeline.
  const pageByUrl = new Map(pages.map((page) => [page.url, page]));
  const timeline = [];
  for (const entry of run.archive?.dated ?? []) {
    const page = pageByUrl.get(entry.url);
    const id = `s${claims.length + 1}`;
    const claim = datedClaim(entry, page, id);
    claims.push(claim);
    seenIds.add(id);
    timeline.push({
      date: dateOf(entry.timestamp),
      label: page ? (KIND_LABEL[page.kind] ?? page.kind) : `Page ${pathOf(entry.url)}`,
      url: entry.url,
      archive_url: archiveUrl(entry.timestamp, entry.url),
      archived_at: entry.timestamp,
      captures: entry.capture_count,
      captures_capped: entry.capture_count_capped,
      claim_id: id,
    });
  }
  timeline.sort((a, b) => a.date.localeCompare(b.date) || a.url.localeCompare(b.url));

  // One Seen claim per community item the reach sources returned. A source that
  // found nothing contributes nothing here, so it can never become a claim.
  const reachItems = [];
  for (const item of run.reach?.items ?? []) {
    const id = `s${claims.length + 1}`;
    claims.push(reachItemClaim(item, id));
    seenIds.add(id);
    reachItems.push({ ...item, claim_id: id });
  }

  const home = byKind('homepage');
  const pricing = byKind('pricing');
  const nextInferredId = () => `i${claims.filter((claim) => claim.label === INFERRED).length + 1}`;

  if (home) claims.push(positioningClaim(home, pricing, nextInferredId(), seenIds));
  if (pricing) claims.push(priceShapeClaim(pricing, nextInferredId(), seenIds));
  if (timeline.length > 0) claims.push(timelineClaim(timeline, nextInferredId(), seenIds));
  if (reachItems.length > 0) claims.push(reachClaim(reachItems, nextInferredId(), seenIds));

  const total = round(run.costLines.reduce((sum, line) => sum + line.cost, 0));

  return {
    run: {
      tool: 'growthmap',
      version: run.version,
      target: run.target,
      host: run.host,
      started_at: run.started_at,
      finished_at: run.finished_at,
      pages: pages.map((page) => ({
        kind: page.kind,
        url: page.url,
        status: page.status,
        http_status: page.http_status ?? null,
        title: page.title ?? '',
        fetched_at: page.fetched_at,
        claim_id: page.claim_id ?? null,
      })),
      timeline,
      reach: {
        items: reachItems,
        sources: run.reach?.sources ?? [],
        calls: run.reach?.calls ?? [],
        attempts: run.reach?.attempts ?? 0,
        stopped: run.reach?.stopped ?? null,
      },
      archive: {
        dated: timeline.length,
        undated: run.archive?.undated ?? [],
        failed: run.archive?.failed ?? [],
        skipped: run.archive?.skipped ?? [],
        attempts: run.archive?.attempts ?? 0,
        stopped: run.archive?.stopped ?? null,
        sitemap: run.sitemap ?? { status: 'skipped', urls: 0 },
      },
    },
    claims,
    costs: { lines: run.costLines, total },
  };
}

export function renderMarkdown({ run, claims, costs }) {
  const lines = [
    `# growthmap report: ${run.host}`,
    '',
    `Run at ${run.finished_at} against ${run.target}.`,
    '',
    '## Seen',
    '',
  ];

  for (const claim of claims.filter((c) => c.label === SEEN)) {
    lines.push(`- **${claim.id}** ${claim.claim}`);
    for (const entry of claim.evidence) {
      lines.push(`  > ${entry.quote}`);
      lines.push(`  <${entry.url}> (fetched ${entry.fetched_at}${entry.http_status ? `, HTTP ${entry.http_status}` : ''})`);
      if (entry.page_url) lines.push(`  page: <${entry.page_url}>`);
    }
  }

  lines.push('', '## Inferred', '');
  const inferred = claims.filter((c) => c.label === INFERRED);
  if (inferred.length === 0) lines.push('- None this run.');
  for (const claim of inferred) {
    lines.push(`- **${claim.id}** ${claim.claim}`);
    lines.push(`  from: ${claim.inferred_from.join(', ')}`);
  }

  lines.push('', '## Timeline', '');
  if (run.timeline.length === 0) lines.push('- No page could be dated by the archive this run.');
  for (const row of run.timeline) {
    lines.push(`- **${row.date}** ${row.label} — <${row.archive_url}>`);
  }
  const undated = run.archive?.undated ?? [];
  const failedCalls = run.archive?.failed ?? [];
  const skippedCalls = run.archive?.skipped ?? [];
  if (undated.length) lines.push('', `Undated: ${undated.length} page(s) the archive has never captured, no date claimed (listed in report.json).`);
  if (failedCalls.length) lines.push('', `Unanswered: ${failedCalls.length} page(s) the archive did not answer for, no date claimed (listed in report.json).`);
  if (run.archive?.stopped) {
    const notAttempted =
      skippedCalls.length === 1 ? '1 page was not attempted' : `${skippedCalls.length} pages were not attempted`;
    lines.push(
      '',
      `The archive asked us to slow down after ${run.archive.stopped.after} calls; ${notAttempted} this run.`,
    );
  }
  lines.push('', '## Reach', '');
  const reachItems = run.reach?.items ?? [];
  const reachSources = run.reach?.sources ?? [];
  if (reachItems.length === 0 && reachSources.length === 0) lines.push('- Nothing found outside the site this run.');
  for (const source of reachSources) {
    lines.push(`### ${REACH_LABEL[source.source] ?? source.source}`, '');
    const own = reachItems.filter((item) => item.source === source.source);
    // A source that found nothing says so instead of inventing a line.
    if (own.length === 0) {
      const why = source.status === 'ok' ? 'found nothing for this query' : `did not answer (${source.status})`;
      lines.push(`- ${why}, no claim made.`);
    }
    for (const item of own) {
      const counts = [];
      if (item.points !== undefined) counts.push(`${item.points} points`);
      if (item.comments !== undefined) counts.push(`${item.comments} comments`);
      const said = counts.length ? ` — ${counts.join(', ')}` : '';
      const where = item.subreddit ? ` in r/${item.subreddit}` : '';
      lines.push(`- **${item.date ?? 'undated'}** "${item.title}"${where}${said} — <${item.url}>`);
      if (item.discussion_url) lines.push(`  discussion: <${item.discussion_url}>`);
    }
    lines.push('');
  }
  if (run.reach?.stopped) {
    lines.push(`The reach search asked us to slow down after ${run.reach.stopped.after} call(s): ${run.reach.stopped.reason}.`, '');
  }

  lines.push('', '## Cost', '', '| source | call | cost (USD) |', '| --- | --- | --- |');
  for (const line of costs.lines) {
    const marker = line.status && line.status !== 'ok' ? ` (${line.status})` : '';
    lines.push(`| ${line.source} | ${line.call}${marker} | ${line.cost.toFixed(2)} |`);
  }
  lines.push('', `**Total: ${costs.total.toFixed(2)} USD**`, '');

  return lines.join('\n');
}
