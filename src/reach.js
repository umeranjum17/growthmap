// Reach: where an app is talked about outside its own site. One public search
// per source, the same politeness rules as every other source here — the shared
// user agent, the shared timeout, no retries, and the first 429 ends the work.
// The endpoints default to the public ones; GROWTHMAP_HN_URL and
// GROWTHMAP_REDDIT_URL exist only so the test can point this code at a local
// stub and stay offline.
import { setTimeout as sleep } from 'node:timers/promises';
import { decodeEntities, getText } from './site.js';

const DEFAULT_HN = 'https://hn.algolia.com/api/v1/search';
// Reddit refuses its JSON search to a plain client (403); the Atom search answers.
const DEFAULT_REDDIT = 'https://www.reddit.com/search.rss';
const HN_STORIES = 20;
const REDDIT_RESULTS = 10;
// A deliberate gap between community calls: these endpoints rate-limit a burst.
const GAP_MS = 400;

export const REACH_LABEL = { hackernews: 'Hacker News', reddit: 'Reddit' };

/** 1725148800 -> 2024-09-01 */
const dayOf = (seconds) =>
  Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString().slice(0, 10) : '';

/**
 * The public Algolia search, restricted to the indexed url. A loose text match
 * on a brand word answers with whatever shares the word — for a software
 * company, university textbooks — so the app's own address is what is searched.
 */
export function hnUrl(query) {
  const params = new URLSearchParams({
    query,
    tags: 'story',
    restrictSearchableAttributes: 'url',
    hitsPerPage: String(HN_STORIES),
  });
  return `${process.env.GROWTHMAP_HN_URL || DEFAULT_HN}?${params}`;
}

/** The public Reddit Atom search for one query. */
export function redditUrl(query) {
  const params = new URLSearchParams({ q: query, limit: String(REDDIT_RESULTS) });
  return `${process.env.GROWTHMAP_REDDIT_URL || DEFAULT_REDDIT}?${params}`;
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

/**
 * A hit is kept only when it is about this app: its link points at the app's own
 * host (or a subdomain of it), or its title names that host. Anything else
 * matched the word, not the app, and must never become a claim.
 */
function aboutApp(hit, appHost) {
  const hitHost = hostOf(hit.url ?? '');
  if (hitHost && (hitHost === appHost || hitHost.endsWith(`.${appHost}`))) return true;
  const title = typeof hit.title === 'string' ? hit.title : '';
  return appHost !== '' && title.toLowerCase().includes(appHost);
}

/**
 * The Reddit search is a loose text match too, so a result is kept only when its
 * subreddit is named after the app, or its title names the app's address.
 * Otherwise it is a stranger's giveaway that happened to share a word.
 */
function aboutCommunity(record, { host, brand }) {
  if (brand && record.subreddit && record.subreddit.toLowerCase().includes(brand.toLowerCase())) return true;
  return host !== '' && record.title.toLowerCase().includes(host.toLowerCase());
}

// Only the fields that came back go into the record and its quote: a count the
// answer did not state is absent, never zero.
const quoteOf = (record) => {
  const shown = { title: record.title };
  for (const key of ['subreddit', 'author', 'points', 'comments', 'date']) {
    if (record[key] !== undefined) shown[key] = record[key];
  }
  return JSON.stringify(shown);
};

/** The Algolia answer, one record per story about this app. Null means unreadable. */
export function parseHn(text, appHost) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(body?.hits)) return null;
  return body.hits
    .filter((hit) => typeof hit?.title === 'string' && hit.title.trim() !== '' && hit.objectID)
    .filter((hit) => aboutApp(hit, appHost))
    .map((hit) => {
      const record = {
        source: 'hackernews',
        title: hit.title.trim(),
        discussion_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
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

const ENTITY = /<entry\b[\s\S]*?<\/entry>/gi;
const tag = (xml, name) => {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
};
const attribute = (xml, tagName, key) => {
  const match = new RegExp(`<${tagName}\\b[^>]*${key}="([^"]*)"`, 'i').exec(xml);
  return match ? decodeEntities(match[1]).trim() : '';
};

/**
 * The Reddit Atom answer, one record per result about this app. The feed states
 * a title, a link, an author, sometimes a subreddit, and a date — and no score
 * or comment count, so the record claims none. Null means the body was not a
 * feed.
 */
export function parseReddit(text, context = {}) {
  if (!/<feed\b/i.test(text)) return null;
  return [...text.matchAll(ENTITY)]
    .map((match) => {
      const entry = match[0];
      const record = { source: 'reddit', title: tag(entry, 'title') };
      const href = attribute(entry, 'link', 'href');
      if (href) record.url = href;
      const author = tag(entry, 'name');
      if (author) record.author = author;
      // The feed names the subreddit in a category when it has one; the
      // permalink names it as well, and a community result carries only that.
      const named = attribute(entry, 'category', 'term');
      const linked = /^https?:\/\/[^/]+\/r\/([\w-]+)/i.exec(href ?? '')?.[1];
      const subreddit = /^[\w-]+$/.test(named) && named ? named : linked;
      if (subreddit) record.subreddit = subreddit;
      const updated = tag(entry, 'updated');
      if (/^\d{4}-\d{2}-\d{2}/.test(updated)) record.date = updated.slice(0, 10);
      return record;
    })
    .filter((record) => record.title !== '' && record.url)
    .filter((record) => aboutCommunity(record, context))
    .map((record) => ({ ...record, quote: quoteOf(record) }));
}

const PARSERS = { hackernews: parseHn, reddit: parseReddit };

/**
 * Make the reach calls in order and read each answer into records.
 * Every call is metered, including the ones that failed. A source that answers
 * with nothing returns no records, which is not a failure. The first 429 ends
 * the reach work for the run; the rest are metered as skipped.
 *
 * @param {{source: string, url: string, host: string, brand?: string}[]} calls
 */
export async function fetchReach(calls) {
  const items = [];
  const records = [];
  const costLines = [];
  let attempts = 0;
  let stopped = null;

  for (const { source, url, host, brand } of calls) {
    const call = `GET ${url}`;
    if (stopped) {
      costLines.push({ source, call, cost: 0, status: 'skipped', reason: stopped.reason });
      records.push({ source, call, status: 'skipped', items: 0 });
      continue;
    }

    if (attempts > 0) await sleep(GAP_MS);
    attempts += 1;
    const result = await getText(url, 'application/atom+xml,application/json');
    const parsed = result.status === 'ok' ? (PARSERS[source]?.(result.body, source === 'reddit' ? { host, brand } : host) ?? null) : null;

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
    const fetched_at = new Date().toISOString().slice(0, 10);
    for (const record of parsed) items.push({ ...record, fetched_at });
    records.push({ source, call, status: 'ok', items: parsed.length });
  }

  // One line per source for the report metadata: how many items it actually added.
  const sources = [];
  for (const source of new Set(calls.map((entry) => entry.source))) {
    const own = records.filter((record) => record.source === source);
    sources.push({
      source,
      status: own.some((record) => record.status === 'ok') ? 'ok' : own[0].status,
      items: own.reduce((sum, record) => sum + record.items, 0),
    });
  }

  return { items, sources, calls: records, costLines, attempts, stopped };
}
