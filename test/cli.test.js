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
import { hnUrl, redditUrl } from '../src/reach.js';

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
      <url><loc>http://FIXTURE_ORIGIN/limited-page</loc></url>
      <url><loc>http://FIXTURE_ORIGIN/after-limit</loc></url>
    </urlset>`,
};

// The archive stub: the captures each URL has. A URL with no entry (or an empty
// list) answers with the header row only, which means the archive never
// captured it. /homepage and /pricing are dated; /ghost-page is not; the
// archive errors for /broken-page and rate-limits us at /limited-page, which
// must end the archive work for the run (/after-limit is never asked).
const ARCHIVE = {
  '/': [['20240801000000', '200', '/']],
  '/pricing': [['20241122200902', '200', '/pricing']],
  '/about': [['20250114083110', '200', '/about']],
  '/pricing/teams': [['20250114083110', '200', '/pricing/teams']],
  '/compare/acme-vs-other': [['20251102093000', '200', '/compare/acme-vs-other']],
  '/de/pricing': [['20251102093000', '200', '/de/pricing']],
  '/blog/post': [['20250301000000', '200', '/blog/post']],
};

// The reach stubs: the community searches the run makes, same local server.
// Run one has a Hacker News search that finds nothing and a Reddit search that
// fails; run two has both answering, including one hit that matched the word
// but not the app, which must be dropped; run three rate-limits the first call.
const HN_STORIES = [
  {
    objectID: '40001',
    title: 'Show HN: Acme ships your app faster',
    points: 128,
    num_comments: 43,
    created_at: '2024-09-01T10:00:00.000Z',
    url: 'http://FIXTURE_ORIGIN/blog/launch',
  },
  {
    objectID: '40002',
    title: 'Ask HN: does anyone still hand-roll deploys?',
    points: 12,
    num_comments: 5,
    created_at: '2024-08-15T09:30:00.000Z',
    url: 'http://FIXTURE_ORIGIN/blog/deploys',
  },
  {
    // Links elsewhere, but names the app's address in the title.
    objectID: '40003',
    title: 'Show HN: Acme CLI – my 127.0.0.1 deploy helper',
    points: 55,
    num_comments: 15,
    created_at: '2024-07-05T12:00:00.000Z',
    url: 'https://github.com/someone/acme-tui',
  },
  {
    // Matched the word, not the app: a maths textbook. Must never become a claim.
    objectID: '40004',
    title: 'Linear Algebra Done Right – 4th Edition',
    points: 631,
    num_comments: 294,
    created_at: '2023-10-29T09:00:00.000Z',
    url: 'https://linear.axler.net',
  },
];

// The Reddit stub answers with an Atom feed, the shape the RSS search returns.
// Two entries are about the app (one in a subreddit named after it, one whose
// title names its address); two merely share a word and must be dropped.
const REDDIT_ENTRIES = [
  // No category tag, the way the feed lists a community: the link names it.
  { title: 'Acme users', author: '/u/dave', date: '2024-08-25', url: 'https://www.reddit.com/r/Acme/' },
  { title: 'Acme CLI – my 127.0.0.1 deploy helper', subreddit: 'devops', author: '/u/erin', date: '2024-07-15', url: 'https://www.reddit.com/r/devops/comments/ghi/acme/' },
  { title: 'Acme just killed our deploy script', subreddit: 'SideProject', author: '/u/alice', date: '2024-06-01', url: 'https://www.reddit.com/r/SideProject/comments/abc/acme/' },
  { title: 'URX Core75 SE Launch + Giveaway', subreddit: 'mkindia', author: '/u/frank', date: '2024-09-10', url: 'https://www.reddit.com/r/mkindia/comments/jkl/urx/' },
];

const redditFeed = (entries) => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
  <category term="reddit.com" label="r/reddit.com"/>
  <updated>2026-10-30T19:33:16+00:00</updated>
  <title>reddit.com: search results - acme</title>
  ${entries
    .map(
      (entry) => `<entry>
    <author><name>${entry.author}</name></author>
    ${entry.subreddit ? `<category term="${entry.subreddit}" label="r/${entry.subreddit}"/>` : ''}
    <content type="html">&lt;div&gt;a post about Acme&lt;/div&gt;</content>
    <link href="${entry.url}"/>
    <updated>${entry.date}T10:00:00+00:00</updated>
    <title>${entry.title}</title>
  </entry>`,
    )
    .join('')}
</feed>`;

async function withFixtureSite(fn) {
  const archivePath = '/stub-cdx';
  const hnPath = '/stub-hn';
  const redditPath = '/stub-reddit';
  let mode = 'first';
  const server = createServer((request, response) => {
    const target = new URL(request.url, 'http://127.0.0.1');
    if (target.pathname === hnPath) {
      if (mode === 'third') {
        response.writeHead(429, { 'content-type': 'text/plain' });
        response.end('slow down');
        return;
      }
      const hits = mode === 'first' ? [] : HN_STORIES;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ hits }).replaceAll('FIXTURE_ORIGIN', `127.0.0.1:${server.address().port}`));
      return;
    }
    if (target.pathname === redditPath) {
      if (mode === 'first') {
        response.writeHead(500, { 'content-type': 'text/plain' });
        response.end('reddit is having a bad day');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/atom+xml' });
      response.end(redditFeed(REDDIT_ENTRIES));
      return;
    }
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
      if (pathname === '/limited-page') {
        response.writeHead(429, { 'content-type': 'text/plain' });
        response.end('slow down');
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
    return await fn(origin, `${origin}${archivePath}`, {
      setMode: (next) => {
        mode = next;
      },
      hnEndpoint: `${origin}${hnPath}`,
      redditEndpoint: `${origin}${redditPath}`,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('growthmap run writes a labelled, costed report for a real site', async () => {
  await withFixtureSite(async (origin, archiveEndpoint, stub) => {
    const runReport = async (dir) =>
      run(process.execPath, [CLI, 'run', origin, '--out', dir], {
        env: {
          ...process.env,
          GROWTHMAP_ARCHIVE_URL: archiveEndpoint,
          GROWTHMAP_HN_URL: stub.hnEndpoint,
          GROWTHMAP_REDDIT_URL: stub.redditEndpoint,
        },
      });
    const out = await mkdtemp(join(tmpdir(), 'growthmap-test-'));
    const { stdout } = await runReport(out);

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

    // A 429 stops the archive work: that call failed, the rest are skipped and
    // still metered, and the report says so plainly. Nothing is retried.
    const stopped = report.run.archive.stopped;
    assert.ok(stopped, 'the run records that the archive rate-limited it');
    assert.equal(report.run.archive.attempts, stopped.after, 'attempts stop at the call that got the 429');
    assert.ok(report.run.archive.skipped.includes(`${origin}/after-limit`), 'the never-asked page is listed as skipped');
    assert.ok(
      !costs.lines.some((line) => line.source === 'archive' && line.call.includes('after-limit') && line.status !== 'skipped'),
      'no archive request is made after the 429',
    );
    assert.ok(
      costs.lines.some((line) => line.status === 'skipped' && line.reason),
      'a skipped call carries its reason',
    );
    assert.ok(
      markdown.includes(`The archive asked us to slow down after ${stopped.after} calls; 1 page was not attempted this run.`),
      'the report says plainly that it stopped early',
    );

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
    const timelineClaim = report.claims.find((claim) => claim.label === 'inferred' && /Timeline|Pages were first seen/.test(claim.claim));
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

    // Whatever timeline sentence is printed, its month figure must be the real
    // number of distinct months its own dates span.
    const distinctMonths = new Set(report.run.timeline.map((row) => row.date.slice(0, 7))).size;
    const statedMonths = Number(/(\d+) different months/.exec(timelineClaim.claim)?.[1] ?? NaN);
    assert.equal(statedMonths, distinctMonths, 'the stated month count matches the dates in the same sentence');

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

    // --- reach: the community searches ---

    assert.match(markdown, /## Reach/, 'the report gains a reach section');

    // The endpoints themselves: the address search, and the Atom search that
    // still answers where Reddit's JSON search refuses a plain client.
    assert.match(hnUrl('acme.test'), /^https:\/\/hn\.algolia\.com\/api\/v1\/search\?.*restrictSearchableAttributes=url/);
    assert.match(redditUrl('acme.test'), /^https:\/\/www\.reddit\.com\/search\.rss\?q=acme\.test&limit=10$/);

    // Run one: the Hacker News search is asked for the app's own address, with
    // the loose text match off, and it finds nothing about the app.
    const hnCall = report.run.reach.calls.find((call) => call.source === 'hackernews');
    assert.match(hnCall.call, /restrictSearchableAttributes=url/, 'the search is constrained to the address');
    assert.equal(hnCall.status, 'ok', 'the search answered, it just had no results about the app');
    assert.equal(hnCall.items, 0, 'the run metadata says it found nothing');
    assert.equal(
      report.run.reach.calls.filter((call) => call.source === 'hackernews').length,
      1,
      'one request per resource',
    );

    // A source that fails is a failed, metered call and never a claim.
    const redditSource = report.run.reach.sources.find((source) => source.source === 'reddit');
    assert.equal(redditSource.status, 'failed');
    assert.equal(redditSource.items, 0);
    assert.ok(
      costs.lines.some((line) => line.source === 'reddit' && line.status === 'failed'),
      'the failing search is in the cost meter',
    );
    assert.match(markdown, /### Reddit[\s\S]*did not answer \(failed\), no claim made\./);

    // Nothing found means no reach claim at all, Seen or Inferred.
    assert.ok(
      !report.claims.some((claim) => /^(Hacker News story|Reddit result)/.test(claim.claim)),
      'a run that found nothing makes no reach claim',
    );
    assert.ok(
      !report.claims.some((claim) => claim.claim.startsWith('Reach:')),
      'with nothing to count there is no reach claim',
    );

    // --- reach, second run: both sources answer ---

    stub.setMode('second');
    const out2 = await mkdtemp(join(tmpdir(), 'growthmap-test-'));
    await runReport(out2);
    const report2 = JSON.parse(await readFile(join(out2, 'report.json'), 'utf8'));
    const costs2 = JSON.parse(await readFile(join(out2, 'costs.json'), 'utf8'));
    const markdown2 = await readFile(join(out2, 'report.md'), 'utf8');
    const seenIds2 = new Set(report2.claims.filter((claim) => claim.label === 'seen').map((claim) => claim.id));

    const hnClaims = report2.claims.filter((claim) => claim.claim.startsWith('Hacker News story'));
    assert.equal(hnClaims.length, 3, 'three hits are about the app, each one Seen claim');
    assert.ok(
      !report2.claims.some((claim) => claim.claim.includes('Linear Algebra Done Right')),
      'a hit that matched the word but not the app is dropped, no claim',
    );
    assert.ok(
      report2.claims.some((claim) => claim.claim.includes('Acme CLI')),
      'a hit whose title names the app is kept even when it links elsewhere',
    );
    for (const claim of hnClaims) {
      const [entry] = claim.evidence;
      assert.match(entry.url, /^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/, 'the discussion link is recorded');
      assert.match(entry.quote, /"points":\d+/, 'the quote is what the API returned');
      assert.match(entry.fetched_at, /^\d{4}-\d{2}-\d{2}$/, 'every item carries the date it was fetched');
    }
    assert.match(hnClaims[0].claim, /128 points, 43 comments/, "the counts are the answer's own");
    assert.match(hnClaims[0].claim, /dated 2024-09-01/);

    const redditClaims = report2.claims.filter((claim) => claim.claim.startsWith('Reddit result'));
    assert.equal(redditClaims.length, 2, 'the entries about the app become Seen claims');
    assert.match(redditClaims[0].claim, /in r\/Acme/, 'the subreddit is named, from the link when the feed gives no category');
    assert.match(redditClaims[0].claim, /by \/u\/dave/, 'the author is named');
    assert.match(redditClaims[0].claim, /dated 2024-08-25/);
    assert.doesNotMatch(redditClaims[0].claim, /points|comments|score/, 'the feed states no score, so none is claimed');
    assert.match(redditClaims[0].evidence[0].url, /^https:\/\/www\.reddit\.com\/r\//, 'the permalink is recorded');
    assert.match(redditClaims[1].claim, /in r\/devops/, 'the entry category names the subreddit when it has one');
    assert.ok(
      !report2.claims.some((claim) => /URX|killed our deploy script/.test(claim.claim)),
      'a Reddit result that only shares a word is dropped, no claim',
    );
    assert.match(markdown2, /### Reddit/, 'the reach section groups by source');

    const reach2 = report2.claims.find((claim) => claim.claim.startsWith('Reach:'));
    for (const ref of reach2.inferred_from) assert.ok(seenIds2.has(ref), `reach claim cites ${ref}, which exists`);
    assert.equal(
      reach2.claim,
      'Reach: 5 items across 2 channels, the busiest Hacker News with 3, the earliest dated 2024-07-05.',
      'two channels, the busiest counted, the earliest item named',
    );
    const sum2 = costs2.lines.reduce((total, line) => total + line.cost, 0);
    assert.equal(costs2.total, Number(sum2.toFixed(2)), 'the total is still the sum of the lines');
    assert.ok(costs2.lines.every((line) => line.cost === 0), 'every reach call is free');

    // --- reach, third run: a rate-limit refusal ends the work, no retry ---

    stub.setMode('third');
    const out3 = await mkdtemp(join(tmpdir(), 'growthmap-test-'));
    await runReport(out3);
    const report3 = JSON.parse(await readFile(join(out3, 'report.json'), 'utf8'));
    const costs3 = JSON.parse(await readFile(join(out3, 'costs.json'), 'utf8'));
    const markdown3 = await readFile(join(out3, 'report.md'), 'utf8');

    assert.ok(report3.run.reach.stopped, 'the run records that a search rate-limited it');
    assert.equal(report3.run.reach.attempts, 1, 'nothing is retried after the refusal');
    assert.deepEqual(
      report3.run.reach.calls.map((call) => call.status),
      ['rate_limited', 'skipped'],
      'the call after the refusal is skipped, not made',
    );
    assert.ok(
      costs3.lines.some((line) => line.source === 'hackernews' && line.status === 'failed'),
      'the refused call is a failed metered call',
    );
    assert.equal(
      costs3.lines.filter(
        (line) => line.status === 'skipped' && line.reason && ['hackernews', 'reddit'].includes(line.source),
      ).length,
      1,
      'the skipped reach call still carries its reason in the meter',
    );
    assert.ok(
      !report3.claims.some((claim) => /^(Hacker News story|Reddit result)/.test(claim.claim)),
      'a run with no answers makes no reach claim',
    );
    assert.match(markdown3, /The reach search asked us to slow down after 1 call/);
  });
});
