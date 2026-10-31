// The rest of reach: the app's videos, its store listings, and the roles it is
// hiring. Same discipline as src/reach.js — the shared user agent and timeout
// from src/site.js, a short gap between calls, no retries, and the first 429
// ends that source's work for the run. Each source is metered at 0.00, and a
// field the answer did not state is absent from the record, never a zero.
//
// The endpoints default to the public ones; GROWTHMAP_YOUTUBE_URL,
// GROWTHMAP_ITUNES_URL, GROWTHMAP_PLAY_URL and GROWTHMAP_PLAY_DETAILS_URL exist
// only so the test can point this code at a local stub and stay offline.
import { setTimeout as sleep } from 'node:timers/promises';
import { decodeEntities, getText, htmlToText } from './site.js';
import { today } from './today.js';
import { REACH_LABEL } from './reach.js';

const DEFAULT_YOUTUBE = 'https://www.youtube.com/results';
const DEFAULT_ITUNES = 'https://itunes.apple.com/search';
const DEFAULT_PLAY = 'https://play.google.com/store/search';
const DEFAULT_PLAY_DETAILS = 'https://play.google.com/store/apps/details';
// The same deliberate gap reach.js keeps between community calls.
const GAP_MS = 400;
// A name search answers with whatever carries the name — the maths videos and
// the band called Linear, after the app's own results. The page's own order is
// kept and the run stops reading at these caps instead of claiming everything.
const MAX_VIDEOS = 10;
const MAX_ROLES = 25;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does this text name the app? A brand inside a longer word is a stranger. */
const mentions = (text, brand) =>
  !brand || new RegExp(`(^|[^a-z0-9])${escapeRegex(brand)}([^a-z0-9]|$)`, 'i').test(text ?? '');

// Only the fields that came back go into the record and its quote.
const quoteOf = (record) => {
  const shown = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== 'source' && key !== 'quote' && value !== undefined) shown[key] = value;
  }
  return JSON.stringify(shown);
};

/**
 * One source's calls, metered. Every request is metered whatever happens; the
 * first 429 stops this source instead of retrying it.
 */
function tracker(source) {
  const t = {
    source,
    items: [],
    calls: [],
    costLines: [],
    attempts: 0,
    stopped: null,
    fetched_at: today(),
    /** One polite GET. Returns the parsed records, or null when the call failed. */
    read: async (url, accept, parse, context) => {
      const call = `GET ${url}`;
      if (t.stopped) {
        t.costLines.push({ source, call, cost: 0, status: 'skipped', reason: t.stopped.reason });
        t.calls.push({ source, call, status: 'skipped', items: 0 });
        return null;
      }
      if (t.attempts > 0) await sleep(GAP_MS);
      t.attempts += 1;
      const result = await getText(url, accept);
      if (result.status === 'http_429') {
        t.stopped = { reason: `the ${REACH_LABEL[source] ?? source} page answered 429 (rate limited)`, after: t.attempts };
        t.costLines.push({ source, call, cost: 0, status: 'failed', reason: 'HTTP 429, rate limited' });
        t.calls.push({ source, call, status: 'rate_limited', items: 0 });
        return null;
      }
      const records = result.status === 'ok' ? parse(result.body, context) : null;
      if (!records) {
        // A shape we cannot read is a failed call, not an empty one: guessing
        // what it meant would invent the very numbers this report refuses.
        t.costLines.push({ source, call, cost: 0, status: 'failed' });
        t.calls.push({ source, call, status: result.status === 'ok' ? 'unreadable' : 'failed', items: 0 });
        return null;
      }
      t.costLines.push({ source, call, cost: 0, status: 'ok' });
      t.calls.push({ source, call, status: 'ok', items: records.length });
      return records;
    },
    add: (records) => {
      for (const record of records) t.items.push({ ...record, fetched_at: t.fetched_at });
    },
    result: () => ({
      items: t.items,
      sources: [
        {
          source,
          status: t.calls.some((call) => call.status === 'ok') ? 'ok' : (t.calls[0]?.status ?? 'skipped'),
          items: t.items.length,
        },
      ],
      calls: t.calls,
      costLines: t.costLines,
      attempts: t.attempts,
      stopped: t.stopped,
    }),
  };
  return t;
}

function merge(results) {
  return {
    items: results.flatMap((result) => result.items),
    sources: results.flatMap((result) => result.sources),
    calls: results.flatMap((result) => result.calls),
    costLines: results.flatMap((result) => result.costLines),
    attempts: results.reduce((sum, result) => sum + result.attempts, 0),
    stopped: results.find((result) => result.stopped)?.stopped ?? null,
  };
}

// --- video: the public YouTube results page ---

export function youtubeUrl(query) {
  // hl/gl ask for the English page: the view-count format then reads the same
  // way every run instead of following this machine's locale.
  const params = new URLSearchParams({ search_query: query, hl: 'en', gl: 'US' });
  return `${process.env.GROWTHMAP_YOUTUBE_URL || DEFAULT_YOUTUBE}?${params}`;
}

/** Every value stored under one key, at any depth of the page's own JSON. */
function collectKey(node, key, found = []) {
  if (Array.isArray(node)) {
    for (const value of node) collectKey(value, key, found);
  } else if (node && typeof node === 'object') {
    for (const [name, value] of Object.entries(node)) {
      if (name === key) found.push(value);
      else collectKey(value, key, found);
    }
  }
  return found;
}

const plain = (value) =>
  typeof value === 'string' ? value : (value?.runs?.[0]?.text ?? value?.simpleText ?? '');

/**
 * The exact count when the page states one. "1.2M views" is a rounded figure,
 * so it is kept as the page's own words and never expanded into a number.
 */
export function exactViews(text) {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)\s*views?$/i.exec(String(text ?? '').trim());
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

/** The search page's own data, one record per video about this app. */
export function parseYoutube(html, context = {}) {
  const match = /ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/.exec(html);
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  return collectKey(data, 'videoRenderer')
    .filter((video) => video?.videoId && plain(video.title))
    .map((video) => {
      const record = { source: 'youtube', title: plain(video.title).trim() };
      const channel = plain(video.longBylineText) || plain(video.ownerText);
      if (channel) record.channel = channel.trim();
      record.url = `https://www.youtube.com/watch?v=${video.videoId}`;
      const stated = plain(video.viewCountText).trim();
      const views = exactViews(stated);
      if (views !== undefined) record.views = views;
      else if (stated) record.views_text = stated;
      return record;
    })
    .filter((record) => mentions(record.title, context.brand) || mentions(record.channel, context.brand))
    // The same video is listed more than once on some result pages.
    .filter((record, index, all) => all.findIndex((other) => other.url === record.url) === index)
    .slice(0, MAX_VIDEOS)
    .map((record) => ({ ...record, quote: quoteOf(record) }));
}

// --- stores: Apple's lookup JSON, Google Play's own pages ---

export function itunesUrl(term) {
  const params = new URLSearchParams({ term, entity: 'software', limit: '25' });
  return `${process.env.GROWTHMAP_ITUNES_URL || DEFAULT_ITUNES}?${params}`;
}

/**
 * Apple's answer, one record per software listing whose own seller site is this
 * app's host. A same-named app from another company is somebody else's listing.
 */
export function parseItunes(text, context = {}) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(body?.results)) return null;
  const host = context.host ?? '';
  return body.results
    .filter((app) => typeof app?.trackName === 'string' && typeof app.trackViewUrl === 'string')
    .filter((app) => {
      const seller = hostOf(app.sellerUrl ?? '');
      return host !== '' && seller !== '' && (seller === host || seller.endsWith(`.${host}`));
    })
    .map((app) => {
      const record = { source: 'appstore', title: app.trackName.trim(), listing_url: app.trackViewUrl };
      // Both stores show a rating to one decimal place; the same shape here.
      const rating = Number(app.averageUserRating);
      if (Number.isFinite(rating)) record.rating = Number(rating.toFixed(1));
      const count = Number(app.userRatingCount);
      if (Number.isInteger(count)) record.rating_count = count;
      return { ...record, quote: quoteOf(record) };
    })
    .filter((record) => mentions(record.title, context.brand));
}

export function playSearchUrl(query) {
  const params = new URLSearchParams({ q: query, c: 'apps', hl: 'en', gl: 'US' });
  return `${process.env.GROWTHMAP_PLAY_URL || DEFAULT_PLAY}?${params}`;
}

export function playDetailsUrl(id) {
  const params = new URLSearchParams({ id, hl: 'en', gl: 'US' });
  return `${process.env.GROWTHMAP_PLAY_DETAILS_URL || DEFAULT_PLAY_DETAILS}?${params}`;
}

/** The listing ids a search result page names, for the cards that name the app. */
export function parsePlaySearch(html, context = {}) {
  const cards = [...html.matchAll(/href="\/store\/apps\/details\?id=([\w.]+)"[^>]*aria-label="([^"]*)"/g)]
    .map((match) => ({ id: match[1], name: decodeEntities(match[2]).trim() }))
    .filter((card) => card.id && mentions(card.name, context.brand));
  return [...new Map(cards.map((card) => [card.id, card])).values()].slice(0, 3);
}

/**
 * The schema.org listing a Play details page carries — the one field on that
 * page that states the rating and its count exactly. A listing whose own
 * author site is not this app's host is somebody else's app of the same name.
 */
export function parsePlayDetails(html, context = {}) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const listing = (Array.isArray(data) ? data : [data]).find((entry) => entry?.['@type'] === 'SoftwareApplication');
    if (!listing) continue;
    const host = context.host ?? '';
    const author = hostOf(listing.author?.url ?? '');
    if (host === '' || author === '' || !(author === host || author.endsWith(`.${host}`))) return [];
    const record = { source: 'playstore', title: String(listing.name ?? '').trim(), listing_url: context.url ?? '' };
    const rating = Number(listing.aggregateRating?.ratingValue);
    if (listing.aggregateRating?.ratingValue !== undefined && Number.isFinite(rating)) {
      record.rating = Number(rating.toFixed(1));
    }
    const count = Number(listing.aggregateRating?.ratingCount);
    if (listing.aggregateRating?.ratingCount !== undefined && Number.isInteger(count)) {
      record.rating_count = count;
    }
    return [{ ...record, quote: quoteOf(record) }];
  }
  // No schema.org listing at all: the page shape is not one we read.
  return null;
}

// --- hiring: the careers page on the app's own host ---

const ATS_HOST = /(ashbyhq|greenhouse\.io|lever\.co|workable\.com|recruitee\.com|smartrecruiters|bamboohr|personio|teamtailor|jobvite)/i;
const JOB_PATH = /\/(careers?|jobs?|positions?|openings?|apply)\/[\w%.~-]{3,}/i;
const NOT_A_ROLE = /^(careers?|jobs?|open roles|open positions|all jobs|see (all|more)|learn more|apply|apply now|read more|view|back|home|contact|←|→)$/i;
// The role row ends in its own call to action; the role is what precedes it.
const TRAILING_CTA = /(?:\s*(?:learn more|view (?:job|role|position)|see (?:more|job)|apply(?: now)?|read more|→|›|»))+\s*$/i;

/**
 * The role titles a careers page links to. A link counts only when it points at
 * a job-shaped address on a hiring board or at a child page of the careers
 * index — a nav link and an "Apply now" button are not roles.
 */
export function parseCareers(html, context = {}) {
  if (!/<html|<!doctype/i.test(html)) return null;
  const roles = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href\s*=\s*"([^"]*)"/i.exec(match[1])?.[1] ?? '';
    const title = htmlToText(match[2]).replace(/\s+/g, ' ').trim().replace(TRAILING_CTA, '').trim();
    if (!title || title.length > 70 || NOT_A_ROLE.test(title)) continue;
    if (!ATS_HOST.test(href) && !JOB_PATH.test(href)) continue;
    if (roles.includes(title)) continue;
    roles.push(title);
  }
  return roles
    .slice(0, MAX_ROLES)
    .map((title) => ({ source: 'hiring', title, url: context.url ?? '', quote: quoteOf({ title }) }));
}

/** The app's own careers page: the one its site advertises first, then the usual paths. */
export function careersCandidates(origin, sitemapUrls = []) {
  const advertised = sitemapUrls.filter((url) => {
    if (!/^https?:\/\//i.test(url) || hostOf(url) !== hostOf(origin)) return false;
    try {
      return /\/(careers?|jobs?)(\/|$)/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  });
  return [...new Set([...advertised, `${origin}/careers`, `${origin}/jobs`])].slice(0, 3);
}

/** The three sources, in a fixed order. */
export async function fetchExtraSources({ origin, host, brand, sitemapUrls = [] }) {
  const results = [];

  // Video: the public results page for the app's name.
  const video = tracker('youtube');
  video.add((await video.read(youtubeUrl(brand), 'text/html', parseYoutube, { brand })) ?? []);
  results.push(video.result());

  // Stores: Apple answers JSON with the seller's own site, so the listing can be
  // tied to this app; Play answers its search page, then the listing page.
  const apples = tracker('appstore');
  apples.add((await apples.read(itunesUrl(brand), 'application/json', parseItunes, { host, brand })) ?? []);
  results.push(apples.result());

  const play = tracker('playstore');
  const cards = (await play.read(playSearchUrl(brand), 'text/html', parsePlaySearch, { brand })) ?? [];
  for (const card of cards) {
    const url = playDetailsUrl(card.id);
    const [listing] = (await play.read(url, 'text/html', parsePlayDetails, { host, url })) ?? [];
    if (listing) {
      play.add([listing]);
      break;
    }
  }
  results.push(play.result());

  // Hiring: the careers page on the app's own host, the first one that lists roles.
  const hiring = tracker('hiring');
  for (const url of careersCandidates(origin, sitemapUrls)) {
    const roles = (await hiring.read(url, 'text/html', parseCareers, { url })) ?? [];
    if (roles.length > 0) {
      hiring.add(roles);
      break;
    }
  }
  results.push(hiring.result());

  return merge(results);
}
