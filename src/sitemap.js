// The sitemap: the pages the site itself advertises, bounded and ordered.
import { decodeEntities, getText } from './site.js';

export const MAX_SITEMAP_URLS = 40;
const MAX_CHILD_SITEMAPS = 4;

/** The <loc> values in a sitemap or sitemap index. */
export function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeEntities(match[1]).trim())
    .filter(Boolean);
}

export const isSitemapIndex = (xml) => /<sitemapindex[\s>]/i.test(xml);

/**
 * Fixed order, never random: pricing first, then comparison or guide pages,
 * then locale directories, then everything else.
 * ponytail: locale is a two-letter first segment, a heuristic; give it a real
 * language list if a target site's paths start colliding.
 */
export function urlRank(pathname) {
  const lower = pathname.toLowerCase();
  if (/^\/(pricing|plans|upgrade)(\/|$)/.test(lower)) return 0;
  if (/\/(vs|versus|compare|comparison|alternatives?|guide|guides)(\/|$)/.test(lower)) return 1;
  if (/^\/[a-z]{2}([-_][a-z]{2})?(\/|$)/.test(pathname)) return 2;
  return 3;
}

/**
 * Read /sitemap.xml, follow up to MAX_CHILD_SITEMAPS child sitemaps, and return
 * at most MAX_SITEMAP_URLS page URLs in the fixed order above.
 * Every request is metered.
 */
export async function fetchSitemap(origin) {
  const root = new URL('/sitemap.xml', origin).href;
  const costLines = [];
  const found = [];

  const read = async (url) => {
    const result = await getText(url, 'application/xml,text/xml');
    costLines.push({ source: 'sitemap', call: `GET ${url}`, cost: 0, status: result.status === 'ok' ? 'ok' : 'failed' });
    return result;
  };

  const rootResult = await read(root);
  if (rootResult.status !== 'ok') return { urls: [], costLines, status: rootResult.status };

  const rootLocs = sitemapLocs(rootResult.body);
  if (!isSitemapIndex(rootResult.body)) {
    found.push(...rootLocs);
  } else {
    for (const child of rootLocs.slice(0, MAX_CHILD_SITEMAPS)) {
      let childUrl;
      try {
        childUrl = new URL(child, root).href;
      } catch {
        continue;
      }
      const result = await read(childUrl);
      if (result.status === 'ok') found.push(...sitemapLocs(result.body));
    }
  }

  const seen = new Set();
  const urls = found
    .map((loc) => {
      try {
        return new URL(loc, origin).href;
      } catch {
        return null;
      }
    })
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => (seen.has(url) ? false : seen.add(url)))
    .map((url) => ({ url, rank: urlRank(new URL(url).pathname) }))
    .sort((a, b) => a.rank - b.rank) // a stable sort keeps sitemap order inside a rank
    .slice(0, MAX_SITEMAP_URLS)
    .map((entry) => entry.url);

  return { urls, costLines, status: 'ok' };
}
