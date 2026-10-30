// Reach: where an app is talked about outside its own site. One public search
// per source, the same politeness rules as every other source here — the shared
// user agent, the shared timeout, no retries, and the first 429 ends the work.
// The endpoints default to the public ones; GROWTHMAP_HN_URL and
// GROWTHMAP_REDDIT_URL exist only so the test can point this code at a local
// stub and stay offline.
import { setTimeout as sleep } from 'node:timers/promises';
import { getText } from './site.js';

const DEFAULT_HN = 'https://hn.algolia.com/api/v1/search';
const DEFAULT_REDDIT = 'https://www.reddit.com/search.json';
const HN_STORIES = 20;
const REDDIT_POSTS = 10;
// A deliberate gap between community calls: these endpoints rate-limit a burst.
const GAP_MS = 400;

export const REACH_LABEL = { hackernews: 'Hacker News', reddit: 'Reddit' };

/** 1725148800 -> 2024-09-01 */
const dayOf = (seconds) =>
  Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString().slice(0, 10) : '';

/** The public Algolia search for one query. */
export function hnUrl(query) {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: String(HN_STORIES) });
  return `${process.env.GROWTHMAP_HN_URL || DEFAULT_HN}?${params}`;
}

/** The public Reddit JSON search for one query. */
export function redditUrl(query) {
  const params = new URLSearchParams({ q: query, sort: 'relevance', type: 'link', limit: String(REDDIT_POSTS) });
  return `${process.env.GROWTHMAP_REDDIT_URL || DEFAULT_REDDIT}?${params}`;
}

// Only the fields that came back go into the record and its quote: a count the
// API did not state is absent, never zero.
const quoteOf = (record) => {
  const { title, points, comments, date, subreddit } = record;
  const shown = { title };
  if (subreddit) shown.subreddit = subreddit;
  if (points !== undefined) shown.points = points;
  if (comments !== undefined) shown.comments = comments;
  if (date) shown.date = date;
  return JSON.stringify(shown);
};

/** The Algolia answer, one record per story. Null means the body did not parse. */
export function parseHn(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(body?.hits)) return null;
  return body.hits
    .filter((hit) => typeof hit?.title === 'string' && hit.title.trim() !== '' && hit.objectID)
    .map((hit) => {
      const record = {
        source: 'hackernews',
        title: hit.title.trim(),
        discussion_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        key: `hn:${hit.objectID}`,
      };
      if (typeof hit.points === 'number') record.points = hit.points;
      if (typeof hit.num_comments === 'number') record.comments = hit.num_comments;
      const date = typeof hit.created_at === 'string' ? hit.created_at.slice(0, 10) : dayOf(hit.created_at_i);
      if (date) record.date = date;
      if (typeof hit.url === 'string' && hit.url) record.url = hit.url;
      record.quote = quoteOf(record);
      return record;
    });
}

/** The Reddit listing, one record per post. Null means the body did not parse. */
export function parseReddit(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const children = body?.data?.children;
  if (!Array.isArray(children)) return null;
  return children
    .map((child) => child?.data)
    .filter((post) => typeof post?.title === 'string' && post.title.trim() !== '' && post.permalink)
    .map((post) => {
      const record = {
        source: 'reddit',
        title: post.title.trim(),
        url: `https://www.reddit.com${post.permalink}`,
        key: `reddit:${post.permalink}`,
      };
      if (typeof post.subreddit === 'string' && post.subreddit) record.subreddit = post.subreddit;
      if (typeof post.score === 'number') record.points = post.score;
      if (typeof post.num_comments === 'number') record.comments = post.num_comments;
      const date = dayOf(post.created_utc);
      if (date) record.date = date;
      record.quote = quoteOf(record);
      return record;
    });
}

const PARSERS = { hackernews: parseHn, reddit: parseReddit };

/**
 * Make the reach calls in order and read each answer into records.
 * Every call is metered, including the ones that failed. One record per item,
 * deduped across calls so an app named in two queries is one record. The first
 * 429 ends the reach work for the run; the rest are metered as skipped.
 *
 * @param {{source: string, url: string}[]} calls
 */
export async function fetchReach(calls) {
  const items = [];
  const seen = new Set();
  const records = [];
  const costLines = [];
  let attempts = 0;
  let stopped = null;

  for (const { source, url } of calls) {
    const call = `GET ${url}`;
    if (stopped) {
      costLines.push({ source, call, cost: 0, status: 'skipped', reason: stopped.reason });
      records.push({ source, call, status: 'skipped', items: 0 });
      continue;
    }

    if (attempts > 0) await sleep(GAP_MS);
    attempts += 1;
    const result = await getText(url, 'application/json');
    const parsed = result.status === 'ok' ? (PARSERS[source]?.(result.body) ?? null) : null;

    if (result.status === 'http_429') {
      stopped = { reason: `the ${REACH_LABEL[source] ?? source} search answered 429 (rate limited)`, after: attempts };
      costLines.push({ source, call, cost: 0, status: 'failed', reason: 'HTTP 429, rate limited' });
      records.push({ source, call, status: 'rate_limited', items: 0 });
      continue;
    }
    if (result.status !== 'ok' || !parsed) {
      // A page whose shape we cannot read is a failed call, not an empty one:
      // guessing what it meant would invent the very numbers this report refuses.
      costLines.push({ source, call, cost: 0, status: 'failed' });
      records.push({ source, call, status: result.status === 'ok' ? 'unreadable' : 'failed', items: 0 });
      continue;
    }

    costLines.push({ source, call, cost: 0, status: 'ok' });
    let added = 0;
    const fetched_at = new Date().toISOString().slice(0, 10);
    for (const record of parsed) {
      if (seen.has(record.key)) continue;
      seen.add(record.key);
      items.push({ ...record, fetched_at });
      added += 1;
    }
    records.push({ source, call, status: 'ok', items: added });
  }

  // One line per source for the report metadata: how many items it actually added.
  const sources = [];
  for (const source of new Set(calls.map((entry) => entry.source))) {
    const own = records.filter((record) => record.source === source);
    const items = own.reduce((sum, record) => sum + record.items, 0);
    sources.push({ source, status: own.some((record) => record.status === 'ok') ? 'ok' : own[0].status, items });
  }

  return { items, sources, calls: records, costLines, attempts, stopped };
}
