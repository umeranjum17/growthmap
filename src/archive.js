// The public web archive: one CDX request per URL, no retries.
// The endpoint is the public one; GROWTHMAP_ARCHIVE_URL only exists so the test
// can point the same code at a local stub and stay offline.
import { getText } from './site.js';

const DEFAULT_CDX = 'https://web.archive.org/cdx/search/cdx';
const ROW_CAP = 100;

/** The request that asks the archive for this exact URL, oldest capture first. */
export function cdxUrl(url) {
  const params = new URLSearchParams({
    url,
    matchType: 'exact',
    output: 'json',
    fl: 'timestamp,statuscode,original',
    filter: 'statuscode:200',
    limit: String(ROW_CAP),
  });
  return `${process.env.GROWTHMAP_ARCHIVE_URL || DEFAULT_CDX}?${params}`;
}

/** The archive's own recorded line for a capture, as the index prints it. */
export const recordedLine = (row) => `${row.timestamp} ${row.statuscode} ${row.original}`;

/** A link a person can open to see the capture itself. */
export const archiveUrl = (timestamp, url) => `https://web.archive.org/web/${timestamp}/${url}`;

/** 20241122200902 -> 2024-11-22 */
export const dateOf = (timestamp) => `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;

/**
 * Read the CDX json body into the earliest capture plus how many captures the
 * archive lists. Null means the archive answered and has nothing for this URL.
 * The count is of statuscode:200 captures, the same filter that makes a date
 * mean a page that actually answered.
 */
export function parseCdx(text) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const [, ...captures] = rows; // rows[0] is the field-name header
  const [timestamp, statuscode, original] = captures[0] ?? [];
  if (!/^\d{14}$/.test(timestamp ?? '')) return null;
  return {
    timestamp,
    statuscode,
    original,
    capture_count: captures.length,
    capture_count_capped: captures.length >= ROW_CAP,
  };
}

/**
 * Ask the archive for the first-seen date of each URL, in order.
 * Dated pages come back with their evidence; a page the archive has never
 * captured is undated; a call that errored or timed out is a failed call.
 * Every call is metered, failed ones included.
 */
export async function archiveDates(urls) {
  const dated = [];
  const undated = [];
  const failed = [];
  const costLines = [];
  for (const url of urls) {
    const fetched_at = new Date().toISOString().slice(0, 10);
    const endpoint = cdxUrl(url);
    const call = `GET ${endpoint}`;
    const result = await getText(endpoint, 'application/json');
    if (result.status !== 'ok') {
      costLines.push({ source: 'archive', call, cost: 0, status: 'failed' });
      failed.push(url);
      continue;
    }
    costLines.push({ source: 'archive', call, cost: 0, status: 'ok' });
    const capture = parseCdx(result.body);
    if (!capture) {
      undated.push(url);
      continue;
    }
    dated.push({ url, fetched_at, ...capture });
  }
  return { dated, undated, failed, costLines };
}
