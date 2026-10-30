// The claim record: the one place a report line can be created.
// A claim is either Seen (a quote the run fetched, with its link and date) or
// Inferred (a judgement that names the Seen claim ids it stands on). Anything
// else throws, so a bare assertion cannot reach a report.

export const SEEN = 'seen';
export const INFERRED = 'inferred';

const isText = (value) => typeof value === 'string' && value.trim() !== '';

function reject(id, problem) {
  throw new Error(`claim ${id ?? '(no id)'} rejected: ${problem}`);
}

const normaliseFrom = (value) => {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (isText(value)) return value.split(/[\s,]+/).filter(Boolean);
  return [];
};

/**
 * Build a claim record, or throw.
 * @param {object} record raw claim fields
 * @param {Set<string>} seenIds ids of the Seen claims in the same report
 */
export function makeClaim(record = {}, seenIds = new Set()) {
  const { id, claim, label } = record;
  if (!isText(id)) reject(id, 'missing id');
  if (!isText(claim)) reject(id, 'missing claim text');

  if (label === SEEN) {
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    if (evidence.length === 0) reject(id, 'a Seen claim needs at least one evidence entry');
    const clean = evidence.map((entry, index) => {
      if (!isText(entry?.url)) reject(id, `evidence ${index + 1} has no url`);
      if (!isText(entry?.quote)) reject(id, `evidence ${index + 1} has no quote`);
      if (!isText(entry?.fetched_at) || Number.isNaN(Date.parse(entry.fetched_at))) {
        reject(id, `evidence ${index + 1} has no fetched_at date`);
      }
      const out = { url: entry.url, quote: entry.quote, fetched_at: entry.fetched_at };
      if (entry.page_url) out.page_url = entry.page_url;
      if (entry.title) out.title = entry.title;
      if (entry.http_status !== undefined) out.http_status = entry.http_status;
      return out;
    });
    return { id, claim, label: SEEN, evidence: clean };
  }

  if (label === INFERRED) {
    const inferred_from = normaliseFrom(record.inferred_from);
    if (inferred_from.length === 0) reject(id, 'an Inferred claim needs a non-empty inferred_from');
    for (const ref of inferred_from) {
      if (!seenIds.has(ref)) reject(id, `inferred_from cites "${ref}", which is not a Seen claim in this report`);
    }
    return { id, claim, label: INFERRED, evidence: [], inferred_from };
  }

  reject(id, `label must be "${SEEN}" or "${INFERRED}"`);
}
