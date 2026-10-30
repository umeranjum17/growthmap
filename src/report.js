// Turns fetched pages into the report: claims first, then the cost table.
import { makeClaim, SEEN, INFERRED } from './claim.js';

const round = (value) => Number(value.toFixed(2));
const quoted = (text) => `"${text}"`;
const KIND_LABEL = { homepage: 'Homepage', pricing: 'Pricing page', about: 'About page', features: 'Features page' };

function seenClaim(page, id) {
  const label = KIND_LABEL[page.kind] ?? page.kind;
  return makeClaim({
    id,
    claim: page.title ? `${label} title: ${quoted(page.title)}.` : `${label} fetched; the page carries no <title>.`,
    label: SEEN,
    evidence: [{ url: page.url, quote: page.quote, fetched_at: page.fetched_at, title: page.title, http_status: page.http_status }],
  });
}

/** Fixed rule: the positioning is the homepage lead plus the pricing framing. */
function positioningClaim(home, pricing, id, seenIds) {
  const parts = [`the homepage leads with ${quoted(home.quote.replace(/\.$/, ''))}`];
  if (pricing) parts.push(`the pricing page says ${quoted(pricing.quote.replace(/\.$/, ''))}`);
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
  const prices = [...new Set(pricing.text.match(/[$€£]\s?\d[\d.,]*/g) ?? [])];
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

  const home = byKind('homepage');
  const pricing = byKind('pricing');

  if (home) claims.push(positioningClaim(home, pricing, `i${claims.filter((c) => c.label === INFERRED).length + 1}`, seenIds));
  if (pricing) claims.push(priceShapeClaim(pricing, `i${claims.filter((c) => c.label === INFERRED).length + 1}`, seenIds));

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
      lines.push(`  <${entry.url}> (fetched ${entry.fetched_at}, HTTP ${entry.http_status})`);
    }
  }

  lines.push('', '## Inferred', '');
  const inferred = claims.filter((c) => c.label === INFERRED);
  if (inferred.length === 0) lines.push('- None this run.');
  for (const claim of inferred) {
    lines.push(`- **${claim.id}** ${claim.claim}`);
    lines.push(`  from: ${claim.inferred_from.join(', ')}`);
  }

  lines.push('', '## Cost', '', '| source | call | cost (USD) |', '| --- | --- | --- |');
  for (const line of costs.lines) lines.push(`| ${line.source} | ${line.call} | ${line.cost.toFixed(2)} |`);
  lines.push('', `**Total: ${costs.total.toFixed(2)} USD**`, '');

  return lines.join('\n');
}
