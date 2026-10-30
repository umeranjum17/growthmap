// One integration test: drives the real CLI against a local fixture site.
// The web archive is stubbed through GROWTHMAP_ARCHIVE_URL so the test is offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeClaim } from '../src/claim.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../bin/growthmap.js', import.meta.url));

const FIXTURES = {
  '/': `<!doctype html><html><head><title>Acme - ship your app faster</title>
    <meta property="og:description" content="Acme ships your team&#x27;s app faster, from first commit to production.">
    </head><body><h1>Ship faster</h1><p>Acme helps small teams ship their app to production faster with one command.</p></body></html>`,
  '/pricing': `<!doctype html><html><head><title>Acme pricing</title></head>
    <body><p>Simple pricing for every team.</p><ul><li>$9 per seat each month</li><li>$29 per seat each month</li></ul>
    <p>Add-ons from $ 1 per month</p></body></html>`,
  '/about': `<!doctype html><html><head><title>About Acme</title></head>
    <body><p>We are a small team building shipping tools for developers everywhere.</p></body></html>`,
  '/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex><sitemap><loc>http://FIXTURE_ORIGIN/child-a.xml</loc></sitemap></sitemapindex>`,
  '/child-a.xml': `<?xml version="1.0" encoding="UTF-8"?>
    <urlset>
      <url><loc>http://FIXTURE_ORIGIN/blog/post</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/de/pricing</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/compare/acme-vs-other</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/pricing/teams</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/ghost-page</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/broken-page</loc></url>
    </urlset>`,
};

// The archive stub: the captures each URL has. A URL with no entry (or an empty
// list) answers with the header row only, which means the archive never
// captured it. /homepage and /pricing are dated; /ghost-page is not; the
// archive errors for /broken-page.
const ARCHIVE = {
  '/': [['20240801000000', '200', '/']],
  '/pricing': [['20241122200902', '200', '/pricing']],
  '/about': [['20250114083110', '200', '/about']],
  '/pricing/teams': [['20250114083110', '200', '/pricing/teams']],
  '/compare/acme-vs-other': [['20251102093000', '200', '/compare/acme-vs-other']],
  '/de/pricing': [['20251102093000', '200', '/de/pricing']],
  '/blog/post': [['20250301000000', '200', '/blog/post']],
};

async function withFixtureSite(fn) {
  const archivePath = '/stub-cdx';
  const server = createServer((request, response) => {
    const target = new URL(request.url, 'http://127.0.0.1');
    if (target.pathname === archivePath) {
      const asked = target.searchParams.get('url') ?? '';
      let pathname = '';
      try {
        pathname = new URL(asked).pathname;
      } catch {
        pathname = '';
      }
      if (pathname === '/broken-page') {
        response.writeHead(500, { 'content-type': 'text/plain' });
        response.end('archive is having a bad day');
        return;
      }
      const rows = ARCHIVE[pathname] ?? [];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([['timestamp', 'statuscode', 'original'], ...rows]));
      return;
    }
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = FIXTURES[request.url]?.replaceAll('FIXTURE_ORIGIN', `127.0.0.1:${server.address().port}`);
    if (!page) {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<title>Not found</title><p>Not found</p>');
      return;
    }
    const type = request.url.endsWith('.xml') ? 'application/xml' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type });
    response.end(page);
    void origin;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(origin, `${origin}${archivePath}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('growthmap run writes a labelled, costed report for a real site', async () => {
  await withFixtureSite(async (origin, archiveEndpoint) => {
    const out = await mkdtemp(join(tmpdir(), 'growthmap-test-'));
    const { stdout } = await run(process.execPath, [CLI, 'run', origin, '--out', out], {
      env: { ...process.env, GROWTHMAP_ARCHIVE_URL: archiveEndpoint },
    });

    assert.match(stdout, /total\s+0\.00 USD/, 'the run prints its total');

    const written = (await readdir(out)).sort();
    assert.deepEqual(written, ['costs.json', 'report.json', 'report.md']);

    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    const costs = JSON.parse(await readFile(join(out, 'costs.json'), 'utf8'));
    const markdown = await readFile(join(out, 'report.md'), 'utf8');

    const seenIds = new Set(report.claims.filter((claim) => claim.label === 'seen').map((claim) => claim.id));
    assert.ok(seenIds.size >= 3, 'the three answering pages become Seen claims');
    assert.ok(
      report.claims.some((claim) => claim.label === 'inferred'),
      'the run writes at least one Inferred claim',
    );

    // The same rule the builder enforces, applied to every claim in the file.
    for (const claim of report.claims) {
      assert.doesNotThrow(() => makeClaim(claim, seenIds), `claim ${claim.id} must pass the claim rule`);
    }

    const sum = costs.lines.reduce((total, line) => total + line.cost, 0);
    assert.equal(costs.total, Number(sum.toFixed(2)));
    assert.equal(
      costs.lines.filter((line) => line.source === 'site').length,
      4,
      'one metered site call per page, the 404 included',
    );
    assert.ok(costs.lines.every((line) => line.source && line.call));

    // --- the new source: archive dates, the sitemap, and the timeline ---

    assert.ok(costs.lines.some((line) => line.source === 'sitemap'), 'the sitemap call is metered');
    assert.ok(costs.lines.some((line) => line.source === 'archive'), 'every archive call is metered');

    // The order is fixed and explainable: pricing, then comparison or guide
    // pages, then locale directories, then the rest. Never random.
    const askedPaths = costs.lines
      .filter((line) => line.source === 'archive')
      .map((line) => new URL(new URL(line.call.replace(/^GET /, '')).searchParams.get('url')).pathname);
    assert.equal(askedPaths[0], '/', 'the pages the site source read are dated first');
    const order = ['/pricing/teams', '/compare/acme-vs-other', '/de/pricing', '/blog/post'];
    const positions = order.map((path) => askedPaths.indexOf(path));
    assert.ok(positions.every((index) => index > 0), 'each sitemap page is asked for');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'pricing, then comparison, then locale, then the rest');

    // One dated Seen claim per captured page, with an openable archive link.
    const dated = report.claims.filter((claim) => claim.label === 'seen' && /first seen in the archive on/.test(claim.claim));
    assert.ok(dated.length >= 4, 'the dated pages become Seen claims');
    for (const claim of dated) {
      const [entry] = claim.evidence;
      assert.match(entry.url, /^https:\/\/web\.archive\.org\/web\/\d{14}\/http/, 'the archive link is openable');
      assert.match(entry.page_url, /^http:\/\/127\.0\.0\.1:\d+/, 'evidence names the page it dates');
      assert.match(entry.quote, /^\d{14} 200 /, "the quote is the archive's own recorded line");
    }
    assert.match(
      dated.find((claim) => claim.claim.startsWith('Pricing page')).claim,
      /first seen in the archive on 2024-11-22/,
    );
    assert.ok(
      dated.some((claim) => claim.claim === 'Page /compare/acme-vs-other first seen in the archive on 2025-11-02.'),
      'a sitemap page is dated too',
    );

    // A page the archive never captured produces no date claim at all.
    assert.ok(report.run.archive.undated.includes(`${origin}/ghost-page`), 'the uncaptured page is listed undated');
    assert.ok(
      !report.claims.some((claim) => claim.claim.includes('/ghost-page')),
      'no claim is built for an undated page',
    );

    // An archive that errors is a failed, metered call; the run carries on.
    const brokenUrl = `${origin}/broken-page`;
    assert.ok(report.run.archive.failed.includes(brokenUrl), 'the errored archive call is recorded as failed');
    assert.ok(
      costs.lines.some((line) => line.source === 'archive' && line.status === 'failed' && line.call.includes('broken-page')),
      'the failed call is in the cost meter',
    );
    assert.ok(!report.claims.some((claim) => claim.claim.includes('/broken-page')), 'a failure never becomes a date');

    // The timeline: oldest to newest, each line with its date and archive link.
    const dates = report.run.timeline.map((row) => row.date);
    assert.deepEqual(dates, [...dates].sort(), 'the timeline runs oldest to newest');
    assert.equal(report.run.timeline.length, dated.length, 'every dated claim is a timeline record');
    for (const row of report.run.timeline) {
      assert.ok(seenIds.has(row.claim_id), 'a timeline record points at a real Seen claim');
      assert.ok(markdown.includes(row.date) && markdown.includes(row.archive_url), `${row.date} is printed with its link`);
    }
    assert.match(markdown, /## Timeline/);

    // The timeline claim is Inferred, cites only Seen ids, and counts exactly.
    const timelineClaim = report.claims.find((claim) => claim.label === 'inferred' && /Timeline|Pages were added/.test(claim.claim));
    assert.ok(timelineClaim, 'the dates are read as a timeline');
    for (const ref of timelineClaim.inferred_from) {
      assert.ok(seenIds.has(ref), `timeline claim cites ${ref}, which is a Seen claim`);
    }
    assert.equal(
      timelineClaim.inferred_from.length,
      report.run.timeline.length,
      'the timeline claim cites every dated page it counts',
    );
    assert.match(timelineClaim.claim, new RegExp(`${report.run.timeline.length} dated pages`), 'exact page count');
    assert.ok(timelineClaim.claim.includes(report.run.timeline[0].date), 'exact earliest date');

    const home = report.claims.find((claim) => claim.id === 's1');
    assert.match(home.claim, /Homepage describes itself as/, 'a meta description quote says so plainly');
    assert.match(home.evidence[0].quote, /your team's app faster/, 'numeric entities are decoded');

    const priceShape = report.claims.find((claim) => claim.claim.startsWith('Price shape'));
    assert.doesNotMatch(priceShape.claim, /\$ 1/, 'a space-separated digit is not a price');
    assert.match(priceShape.claim, /\$9/);

    for (const claim of report.claims) {
      assert.doesNotMatch(JSON.stringify(claim), /&#/, 'no undecoded HTML entities in any claim');
      assert.doesNotMatch(claim.claim, /\.\./, 'no doubled full stop');
      assert.ok(markdown.includes(claim.id), `${claim.id} is printed in report.md`);
    }
    assert.ok(report.run.pages.some((page) => page.status === 'not_found'), 'the 404 is recorded, not claimed');
  });
});
