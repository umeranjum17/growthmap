// The one source this slice has: the app's own public pages.
// One request per page, a normal user agent, a 20 second timeout, no retries.

const USER_AGENT = 'growthmap/0.1 (public pages reader; growthmap report tool)';
const TIMEOUT_MS = 20_000;

const PAGES = [
  { kind: 'homepage', path: '/' },
  { kind: 'pricing', path: '/pricing' },
  { kind: 'about', path: '/about' },
  { kind: 'features', path: '/features' },
];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/gi, (match) => ENTITIES[match.toLowerCase()] ?? match);
}

export function htmlToText(html) {
  return decode(
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
  return match ? decode(match[1]).replace(/\s+/g, ' ').trim() : '';
}

/** The shortest piece of page text that can carry a claim: one readable sentence. */
export function pickQuote(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  // Prefer real prose over a nav strip: a sentence that ends with punctuation.
  const prose = sentences.find((sentence) => /[.!?]$/.test(sentence) && sentence.length >= 40 && sentence.length <= 240);
  if (prose) return prose;
  const fallback = sentences.find((sentence) => sentence.length >= 30) ?? sentences[0] ?? '';
  if (fallback.length <= 240) return fallback;
  return `${fallback.slice(0, 240).replace(/\s+\S*$/, '').trim()}...`;
}

const today = () => new Date().toISOString().slice(0, 10);

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
    const quote = pickQuote(text);
    const title = extractTitle(html);
    if (!quote) return { url, fetched_at, http_status, status: 'no_text', title };
    return { url, fetched_at, http_status, status: 'ok', title, quote, text };
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
