// The app's own public pages: one request per page, a normal user agent, a
// 20 second timeout, no retries. The same getText() serves the archive and
// sitemap sources so the politeness rules live in one place.

import { gunzipSync } from 'node:zlib';
import { today } from './today.js';

const USER_AGENT = 'growthmap/0.1 (public pages reader; growthmap report tool)';
const TIMEOUT_MS = 20_000;

const gunzipped = (buffer) =>
  buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');

/**
 * One polite GET: the shared user agent, the shared timeout, no retries.
 * Every source uses this so the discipline is one place.
 */
export async function getText(url, accept) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept },
    });
    const http_status = response.status;
    if (http_status !== 200) {
      await response.body?.cancel().catch(() => {});
      return { http_status, status: `http_${http_status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { http_status, status: 'ok', body: gunzipped(buffer) };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { status: timedOut ? 'timeout' : 'error', error: String(error?.message ?? error) };
  }
}

const PAGES = [
  { kind: 'homepage', path: '/' },
  { kind: 'pricing', path: '/pricing' },
  { kind: 'about', path: '/about' },
  { kind: 'features', path: '/features' },
];

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  middot: '\u00b7', bull: '\u2022', times: '\u00d7', deg: '\u00b0',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  pound: '\u00a3', euro: '\u20ac', cent: '\u00a2', yen: '\u00a5',
  sect: '\u00a7', para: '\u00b6', laquo: '\u00ab', raquo: '\u00bb',
  eacute: '\u00e9', egrave: '\u00e8', uuml: '\u00fc', ouml: '\u00f6', auml: '\u00e4', szlig: '\u00df',
};

/** Decode named and numeric (decimal or hex) HTML entities. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function attributesOf(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return attributes;
}

/** Content of the first <meta> whose property/name is one of the keys, in order. */
export function metaContent(html, keys) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributesOf(match[0]));
  for (const key of keys) {
    const found = metas.find((attributes) => (attributes.property ?? attributes.name ?? '').toLowerCase() === key);
    if (found?.content?.trim()) {
      const content = decodeEntities(found.content).replace(/\s+/g, ' ').trim();
      if (content) return content;
    }
  }
  return '';
}

// Nav strips and calls to action are not a description of the product.
const BOILERPLATE = /\b(skip to (?:main )?content|log ?in|log ?out|sign ?in|sign ?up|contact|docs|documentation|cookies?|privacy|open app|get started|all rights reserved)\b/i;

/** A menu run reads as mostly capitalised words, not as a sentence. */
function looksLikeMenu(sentence) {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  const menuWords = words.filter((word) => /^[A-Z]/.test(word) || word.length === 1).length;
  return menuWords / words.length > 0.6;
}

const usable = (sentence) =>
  sentence.length >= 30 && sentence.length <= 240 && !BOILERPLATE.test(sentence) && !looksLikeMenu(sentence);

/** Fallback quote: the first readable sentence of prose, nav and boilerplate dropped. */
export function pickProseQuote(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter(usable);
  return sentences.find((sentence) => /[.!?]$/.test(sentence)) ?? sentences[0] ?? '';
}

async function fetchPage(url) {
  const fetched_at = today();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    const http_status = response.status;
    if (http_status !== 200) {
      await response.body?.cancel().catch(() => {});
      return { url, fetched_at, http_status, status: http_status === 404 ? 'not_found' : `http_${http_status}` };
    }
    const type = response.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) {
      await response.body?.cancel().catch(() => {});
      return { url, fetched_at, http_status, status: 'not_html' };
    }
    const html = await response.text();
    const text = htmlToText(html);
    const title = extractTitle(html);

    // The page's own self-description is the best quote a growth report can carry.
    const description = metaContent(html, ['og:description', 'description', 'twitter:description']);
    const quote = description || pickProseQuote(text);
    if (!quote) return { url, fetched_at, http_status, status: 'no_text', title };
    return {
      url,
      fetched_at,
      http_status,
      status: 'ok',
      title,
      quote,
      quote_source: description ? 'description' : 'prose',
      text,
    };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { url, fetched_at, status: timedOut ? 'timeout' : 'error', error: String(error?.message ?? error) };
  }
}

/**
 * Fetch the site pages for a target origin. One request per page, in order.
 * Every request is metered, including the ones that failed.
 */
export async function fetchSite(origin) {
  const pages = [];
  const costLines = [];
  for (const page of PAGES) {
    const url = new URL(page.path, origin).href;
    const result = await fetchPage(url);
    pages.push({ kind: page.kind, ...result });
    costLines.push({ source: 'site', call: `GET ${url}`, cost: 0 });
  }
  return { pages, costLines };
}
