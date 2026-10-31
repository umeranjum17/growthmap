// One integration test: drives the real CLI against a local fixture site.
// The web archive is stubbed through GROWTHMAP_ARCHIVE_URL so the test is offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeClaim } from '../src/claim.js';
import { hnUrl, redditUrl } from '../src/reach.js';
import { acceptPlays, playbookPrompt, withPlaybook } from '../src/playbook.js';
import { SOURCES } from '../src/registry.js';

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
  // The careers page: two real roles, plus a nav link and an "Apply now" button
  // that are not roles and must never become claims.
  '/careers': `<!doctype html><html><head><title>Careers at Acme</title></head><body>
    <nav><a href="/careers">Careers</a><a href="/about">About</a></nav>
    <h1>Open roles</h1>
    <div><a href="/careers/1f2e-product-engineer"><span>Product Engineer</span></a></div>
    <div><a href="/careers/9a8b-brand-designer"><span>Brand Designer</span></a></div>
    <a href="/careers/apply">Apply now</a>
    </body></html>`,
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

// The video stub: the results page's own embedded data. Two videos are about
// the app (one states an exact count, one states none at all, so the count is
// absent from its record); the third only matched a word and must be dropped.
const YOUTUBE_VIDEOS = [
  {
    videoId: 'vid00000001',
    title: { runs: [{ text: 'Acme in five minutes' }] },
    longBylineText: { runs: [{ text: 'Acme' }] },
    viewCountText: { simpleText: '206,412 views' },
  },
  {
    videoId: 'vid00000002',
    title: { runs: [{ text: 'Acme setup walkthrough' }] },
    longBylineText: { runs: [{ text: 'Dev Notes' }] },
  },
  {
    videoId: 'vid00000004',
    title: { runs: [{ text: 'Acme launch keynote' }] },
    longBylineText: { runs: [{ text: 'Acme' }] },
    // A rounded figure stays the page's own words; it is never expanded.
    viewCountText: { simpleText: '1.2M views' },
  },
  {
    videoId: 'vid00000003',
    title: { runs: [{ text: 'Shipping Rust to production' }] },
    longBylineText: { runs: [{ text: 'Systems Weekly' }] },
    viewCountText: { simpleText: '9,001 views' },
  },
];

const youtubePage = (videos) => `<html><body><script>var ytInitialData = ${JSON.stringify({
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [{ itemSectionRenderer: { contents: videos.map((video) => ({ videoRenderer: video })) } }],
        },
      },
    },
  },
})};</script></body></html>`;

// The iTunes stub: one listing whose own seller site is the app's host, and one
// same-named app whose seller site is somebody else, which must be dropped.
const ITUNES_RESULTS = [
  {
    trackName: 'Acme – ship faster',
    trackViewUrl: 'https://apps.apple.com/us/app/acme/id123?uo=4',
    averageUserRating: 4.83022,
    userRatingCount: 2303,
    sellerUrl: 'http://FIXTURE_ORIGIN/',
  },
  {
    trackName: 'Acme Ring Light',
    trackViewUrl: 'https://apps.apple.com/us/app/acme-ring/id456?uo=4',
    averageUserRating: 3.1,
    userRatingCount: 88,
    sellerUrl: 'https://other.example/',
  },
];

// The Play stub: a search page with two cards that both name the app, then a
// details page per listing. The first card's listing belongs to another company
// (its schema.org author site is elsewhere) and must not become a claim.
const PLAY_SEARCH = `<html><body>
  <div><a href="/store/apps/details?id=com.acme.ringlight" aria-label="Acme Ring Light"></a></div>
  <div><a href="/store/apps/details?id=com.acme.app" aria-label="Acme"></a></div>
</body></html>`;

const PLAY_LISTINGS = {
  'com.acme.ringlight': {
    '@type': 'SoftwareApplication',
    name: 'Acme Ring Light',
    author: { '@type': 'Person', name: 'Other Co', url: 'https://other.example/' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '3.1', ratingCount: '88' },
  },
  'com.acme.app': {
    '@type': 'SoftwareApplication',
    name: 'Acme',
    author: { '@type': 'Person', name: 'Acme Inc', url: 'http://FIXTURE_ORIGIN' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.554455280303955', ratingCount: '1350' },
  },
};

const playDetailsPage = (listing) => `<html><body><script type="application/ld+json">${JSON.stringify(listing)}</script></body></html>`;

async function withFixtureSite(fn) {
  const archivePath = '/stub-cdx';
  const hnPath = '/stub-hn';
  const redditPath = '/stub-reddit';
  const youtubePath = '/stub-youtube';
  const itunesPath = '/stub-itunes';
  const playSearchPath = '/stub-play-search';
  const playDetailsPath = '/stub-play-details';
  let mode = 'first';
  const server = createServer((request, response) => {
    const target = new URL(request.url, 'http://127.0.0.1');
    const fixtureOrigin = `127.0.0.1:${server.address().port}`;
    if (target.pathname === youtubePath) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(youtubePage(mode === 'first' ? [] : YOUTUBE_VIDEOS));
      return;
    }
    if (target.pathname === itunesPath) {
      const results = mode === 'first' ? [] : ITUNES_RESULTS;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ resultCount: results.length, results }).replaceAll('FIXTURE_ORIGIN', fixtureOrigin));
      return;
    }
    if (target.pathname === playSearchPath) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(mode === 'first' ? '<html><body>No results found</body></html>' : PLAY_SEARCH);
      return;
    }
    if (target.pathname === playDetailsPath) {
      const listing = PLAY_LISTINGS[target.searchParams.get('id')];
      if (!listing) {
        response.writeHead(404, { 'content-type': 'text/html' });
        response.end('<title>Not found</title>');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(playDetailsPage(listing).replaceAll('FIXTURE_ORIGIN', fixtureOrigin));
      return;
    }
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
    // Run one has no careers page at all: the app's host answers 404 for both
    // the usual paths, which the run records as failed calls, not as claims.
    const page =
      target.pathname === '/careers' && mode === 'first'
        ? undefined
        : FIXTURES[request.url]?.replaceAll('FIXTURE_ORIGIN', `127.0.0.1:${server.address().port}`);
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
      youtubeEndpoint: `${origin}${youtubePath}`,
      itunesEndpoint: `${origin}${itunesPath}`,
      playEndpoint: `${origin}${playSearchPath}`,
      playDetailsEndpoint: `${origin}${playDetailsPath}`,
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
          GROWTHMAP_YOUTUBE_URL: stub.youtubeEndpoint,
          GROWTHMAP_ITUNES_URL: stub.itunesEndpoint,
          GROWTHMAP_PLAY_URL: stub.playEndpoint,
          GROWTHMAP_PLAY_DETAILS_URL: stub.playDetailsEndpoint,
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

    // The sources table is one list, and a real run proves it covers the meter:
    // every source name this run emitted is a row in `growthmap sources`.
    assert.deepEqual(
      [...new Set(costs.lines.map((line) => line.source))].sort(),
      SOURCES.map((source) => source.name).sort(),
      'every source this run metered is in the sources table',
    );

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

    // --- the new sources, run one: every one of them answers with nothing ---

    for (const source of ['youtube', 'appstore', 'playstore']) {
      const own = report.run.reach.sources.find((entry) => entry.source === source);
      assert.ok(own, `${source} is named in the run metadata`);
      assert.equal(own.status, 'ok', `${source} answered, it just found nothing`);
      assert.equal(own.items, 0, `${source} found nothing`);
      assert.ok(
        costs.lines.every((line) => line.source !== source || line.cost === 0),
        `${source} is metered at free`,
      );
    }
    // An empty answer is a claim-free answer, never a zero printed as a fact.
    assert.ok(
      !report.claims.some((claim) => /^(YouTube video|App Store listing|Google Play listing|Hiring role)/.test(claim.claim)),
      'a run where the new sources found nothing makes no claim for them',
    );
    assert.match(markdown, /### YouTube[\s\S]*found nothing for this query, no claim made\./);
    assert.match(markdown, /### App Store[\s\S]*found nothing for this query, no claim made\./);

    // No careers page answers: two failed, metered calls and no claim at all.
    const hiringSource = report.run.reach.sources.find((entry) => entry.source === 'hiring');
    assert.equal(hiringSource.status, 'failed', 'the run says the careers page did not answer');
    assert.equal(hiringSource.items, 0);
    assert.equal(
      costs.lines.filter((line) => line.source === 'hiring' && line.status === 'failed').length,
      2,
      'both usual careers paths were tried and both are metered as failed',
    );
    assert.match(markdown, /### Hiring[\s\S]*did not answer \(failed\), no claim made\./);

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

    // --- the new sources, run two: video, both stores, and the roles ---

    const videoClaims = report2.claims.filter((claim) => claim.claim.startsWith('YouTube video'));
    assert.equal(videoClaims.length, 3, 'the videos about the app become Seen claims');
    assert.match(videoClaims[0].claim, /"Acme in five minutes" by Acme \(206,412 views\)/, "the exact count is the page's own");
    assert.match(videoClaims[0].evidence[0].url, /^https:\/\/www\.youtube\.com\/watch\?v=vid00000001$/, 'the watch link is recorded');
    assert.match(videoClaims[0].evidence[0].fetched_at, /^\d{4}-\d{2}-\d{2}$/, 'the date it was read is recorded');
    const unstated = report2.run.reach.items.find((item) => item.title === 'Acme setup walkthrough');
    assert.ok(unstated, 'the video with no count is still recorded');
    assert.equal(unstated.views, undefined, 'a count the page never stated is absent, not zero');
    assert.equal(unstated.views_text, undefined);
    assert.equal(videoClaims[1].claim, 'YouTube video "Acme setup walkthrough" by Dev Notes.', 'no count is printed for a video that states none');
    assert.equal(videoClaims[2].claim, 'YouTube video "Acme launch keynote" by Acme (1.2M views).', "a rounded count is kept as the page's own words");
    const rounded = report2.run.reach.items.find((item) => item.title === 'Acme launch keynote');
    assert.equal(rounded.views, undefined, 'a rounded figure is never expanded into a precise count');
    assert.equal(rounded.views_text, '1.2M views');
    assert.ok(
      !report2.claims.some((claim) => claim.claim.includes('Shipping Rust')),
      'a video that only matched a word is dropped, no claim',
    );

    const storeClaims = report2.claims.filter((claim) => claim.claim.startsWith('App Store listing'));
    assert.equal(storeClaims.length, 1, "the listing whose seller site is the app's host is the app");
    assert.equal(
      storeClaims[0].claim,
      'App Store listing "Acme – ship faster" (rated 4.8, 2,303 ratings).',
      "the rating and its count are the answer's own",
    );
    assert.match(storeClaims[0].evidence[0].url, /^https:\/\/apps\.apple\.com\/us\/app\/acme\//, 'the listing url is recorded');
    assert.ok(
      !report2.claims.some((claim) => claim.claim.includes('Ring Light')),
      'a same-named app from another company never becomes a claim',
    );

    const playClaims = report2.claims.filter((claim) => claim.claim.startsWith('Google Play listing'));
    assert.equal(playClaims.length, 1);
    assert.equal(
      playClaims[0].claim,
      'Google Play listing "Acme" (rated 4.6, 1,350 ratings).',
      'the schema.org listing states an exact rating count',
    );
    assert.match(playClaims[0].evidence[0].url, /\/stub-play-details\?id=com\.acme\.app/, 'the listing page read is recorded');
    assert.equal(
      report2.run.reach.calls.filter((call) => call.source === 'playstore' && call.status === 'ok').length,
      3,
      'the search and both named listings are read, in order',
    );

    const roleClaims = report2.claims.filter((claim) => claim.claim.startsWith('Hiring role'));
    assert.deepEqual(
      roleClaims.map((claim) => claim.claim),
      [
        'Hiring role "Product Engineer" is open on the app\'s careers page.',
        'Hiring role "Brand Designer" is open on the app\'s careers page.',
      ],
      'the roles the careers page advertises, and nothing else',
    );
    for (const claim of roleClaims) {
      assert.equal(claim.evidence[0].url, `${origin}/careers`, "the page read is the app's own careers page");
      assert.match(claim.evidence[0].fetched_at, /^\d{4}-\d{2}-\d{2}$/, 'the date it was read is recorded');
    }
    assert.match(markdown2, /### YouTube/);
    assert.match(markdown2, /### App Store/);
    assert.match(markdown2, /### Google Play/);
    assert.match(markdown2, /### Hiring/);

    const reach2 = report2.claims.find((claim) => claim.claim.startsWith('Reach:'));
    for (const ref of reach2.inferred_from) assert.ok(seenIds2.has(ref), `reach claim cites ${ref}, which exists`);
    assert.equal(
      reach2.claim,
      'Reach: 12 items across 6 channels, the busiest Hacker News with 3, the earliest dated 2024-07-05.',
      'every channel is counted, the busiest one named, the earliest item named',
    );
    assert.equal(
      reach2.inferred_from.length,
      report2.run.reach.items.length,
      'the reach count cites every item it counts',
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

    assert.deepEqual(
      report3.run.reach.calls.filter((call) => ['hackernews', 'reddit'].includes(call.source)).map((call) => call.status),
      ['rate_limited', 'skipped'],
      'the call after the refusal is skipped, not made',
    );
    assert.equal(
      report3.run.reach.calls.filter((call) => call.source === 'hackernews').length,
      1,
      'the refused search is not retried',
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
    assert.ok(report3.run.reach.stopped, 'the run records that a search rate-limited it');

    // --- the playbook: the brief out, the checked answer back in ---

    const cli = (args) => run(process.execPath, [CLI, ...args]);
    const briefPath = join(out, 'playbook-prompt.md');
    const { stdout: briefOut } = await cli(['playbook', out]);
    const brief = await readFile(briefPath, 'utf8');
    assert.match(briefOut, /wrote .*playbook-prompt\.md/, 'the command says what it wrote');

    // The brief names the app, the run date, and every Seen record with its id,
    // its claim, its url and its quote: the agent works from this and nothing else.
    assert.ok(brief.includes(report.run.host), 'the brief names the app');
    assert.ok(brief.includes(report.run.finished_at.slice(0, 10)), 'the brief names the run date');
    const seenClaims = report.claims.filter((claim) => claim.label === 'seen');
    for (const claim of seenClaims) {
      assert.ok(brief.includes(`### ${claim.id}`), `the brief lists Seen ${claim.id}`);
      assert.ok(brief.includes(claim.claim.replace(/\s+/g, ' ')), `the brief carries the claim text of ${claim.id}`);
      for (const entry of claim.evidence) {
        assert.ok(brief.includes(entry.url), `the brief carries the url of ${claim.id}`);
        assert.ok(brief.includes(entry.quote.replace(/\s+/g, ' ').trim()), `the brief carries the quote of ${claim.id}`);
      }
    }
    assert.ok(brief.includes('plays.json'), 'the brief names the file to write');
    assert.ok(brief.includes('"cites"'), 'the brief states the shape to return');
    assert.match(brief, /Every play must cite at least one Seen id from this run/, 'the brief states the rule');
    assert.ok(!brief.includes('s999'), 'the brief holds no id the run never saw');

    // Deterministic: asking again over the same report yields the same bytes.
    await cli(['playbook', out]);
    assert.equal(await readFile(briefPath, 'utf8'), brief, 'the same report produces the same brief');
    assert.equal(playbookPrompt(report), brief, 'the brief is a function of the report alone');

    // A valid answer is accepted and written into report.md as the last section.
    const seenList = [...seenIds];
    const playsFile = join(out, 'plays.json');
    const plays = {
      plays: [
        {
          title: 'Ship a comparison page against the incumbent',
          effort: 'One writer for a day',
          first_result: 'One page live on our own host',
          prompt: 'Write the /vs- page for our main competitor.',
          cites: [seenList[0], seenList[1]],
        },
      ],
    };
    await writeFile(playsFile, JSON.stringify(plays, null, 2), 'utf8');
    const { stdout: accepted } = await cli(['playbook', out, '--accept', playsFile]);
    assert.match(accepted, /accepted 1 play/, 'the command says it took the plays');
    const withPlays = await readFile(join(out, 'report.md'), 'utf8');
    assert.ok(withPlays.startsWith(markdown.trimEnd()), 'the report itself is kept, the playbook is added after it');
    assert.equal(withPlays.trimEnd().split('\n## Playbook').length, 2, 'one Playbook section, at the end');
    assert.match(withPlays, /## Playbook[\s\S]*### 1\. Ship a comparison page against the incumbent/);
    assert.ok(withPlays.includes('**Effort:** One writer for a day'), 'the play shows its effort');
    assert.ok(withPlays.includes('**First result:** One page live on our own host'), 'the play shows its first result');
    assert.ok(withPlays.includes('Write the /vs- page for our main competitor.'), 'the play shows its prompt');
    assert.ok(withPlays.includes(`*Seen:* ${seenList[0]}, ${seenList[1]}`), 'the play shows the Seen ids it rests on');
    assert.equal(withPlaybook(withPlays, acceptPlays(JSON.stringify(plays), seenIds).plays), withPlays, 'accepting twice changes nothing');

    // A refusal writes nothing and says why. Each one exits 2.
    const refuse = async (name, body, message) => {
      const file = join(out, `${name}.json`);
      await writeFile(file, body, 'utf8');
      const before = await readFile(join(out, 'report.md'), 'utf8');
      await assert.rejects(cli(['playbook', out, '--accept', file]), (error) => {
        assert.equal(error.code, 2, `${name} is refused with exit code 2`);
        assert.match(error.stderr, message);
        return true;
      });
      assert.equal(await readFile(join(out, 'report.md'), 'utf8'), before, `report.md is unchanged by the ${name} refusal`);
    };
    const play = (over) => JSON.stringify({ plays: [{ ...plays.plays[0], ...over }] });
    await refuse('unknown-id', play({ cites: [seenList[0], 's999'] }), /cites "s999", which is not a Seen record in this report/);
    await refuse('no-citation', play({ cites: [] }), /cites no Seen id/);
    await refuse('no-effort', play({ effort: undefined }), /has no effort/);
    await refuse('no-title', play({ title: '   ' }), /has no title/);
    await refuse('not-json', 'these are not the plays you are looking for', /not valid JSON/);
    await refuse('no-plays', '{"plays":[]}', /holds no plays/);

    // The committed example is the same check applied to a real run: if it ever
    // stops being accepted, the example or the check is wrong.
    const exampleDir = new URL('../examples/plausible.io/', import.meta.url);
    const example = JSON.parse(await readFile(new URL('report.json', exampleDir), 'utf8'));
    const exampleSeen = new Set(example.claims.filter((claim) => claim.label === 'seen').map((claim) => claim.id));
    const exampleAnswer = acceptPlays(await readFile(new URL('plays.json', exampleDir), 'utf8'), exampleSeen);
    assert.ok(exampleAnswer.plays?.length > 0, `the committed example passes the acceptance check: ${exampleAnswer.error}`);
    assert.equal(playbookPrompt(example), await readFile(new URL('playbook-prompt.md', exampleDir), 'utf8'), 'the committed brief is what this report produces');
    assert.equal(
      withPlaybook(await readFile(new URL('report.md', exampleDir), 'utf8'), exampleAnswer.plays),
      await readFile(new URL('report.md', exampleDir), 'utf8'),
      'the committed report already holds exactly those plays',
    );
  });
});

test('the landing page is one self-contained file that loads nothing', async () => {
  const dir = fileURLToPath(new URL('../docs/', import.meta.url));
  assert.deepEqual((await readdir(dir)).sort(), ['index.html'], 'one file, nothing beside it');
  const html = await readFile(join(dir, 'index.html'), 'utf8');

  // Everything it needs ships inside it: no script, no stylesheet, no image or
  // font it has to fetch, so it opens the same from file:// and from the web.
  assert.match(html, /<style>/, 'its styles are inline');
  for (const [name, pattern] of [
    ['script', /<script/i],
    ['stylesheet link', /<link\b/i],
    ['src attribute', /\bsrc\s*=/i],
    ['css import', /@import/i],
    ['css url()', /url\(/i],
    ['inline style attribute', /\sstyle\s*=/i],
  ]) {
    assert.doesNotMatch(html, pattern, `the page carries no ${name}`);
  }

  // The only http(s) in the page is inside a link a reader may choose to open.
  assert.doesNotMatch(
    html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, ''),
    /https?:/i,
    'no external resource is referenced',
  );

  // The example is real, and set as a report rather than as raw Markdown: each
  // printed field appears in the committed report once its markers are gone.
  const example = await readFile(new URL('../examples/plausible.io/report.md', import.meta.url), 'utf8');
  const plain = example.replaceAll('**', '');
  const card = /<article class="play"[\s\S]*?<\/article>/.exec(html)[0];
  const printed = [...card.matchAll(/<(?:h3|dd)>([\s\S]*?)<\/(?:h3|dd)>/g)].map((match) => match[1]);
  printed.push(...[...card.matchAll(/class="chip">([^<]+)</g)].map((match) => match[1]));
  assert.ok(printed.length >= 6, 'the card prints the title, both fields and the ids it cites');
  for (const text of printed) {
    assert.ok(plain.includes(text), `the printed text is in the committed report: ${text.slice(0, 48)}`);
  }
  assert.doesNotMatch(card, /###|\*\*|\*Seen:\*/, 'the card shows a report, not marked-up Markdown');

  // The second example is quoted under the three steps, before the honesty
  // rule, and every value in the block is a line that run printed: nothing is
  // rounded, reformatted or invented.
  const excerpt = /<article class="excerpt"[\s\S]*?<\/article>/.exec(html)[0];
  assert.ok(
    html.indexOf('class="excerpt"') > html.indexOf('class="steps"') &&
      html.indexOf('class="excerpt"') < html.indexOf('id="rule"'),
    'the excerpt sits under the three steps, before the honesty rule',
  );
  const secondDir = fileURLToPath(new URL('../examples/linear.app/', import.meta.url));
  assert.deepEqual(
    (await readdir(secondDir)).sort(),
    ['costs.json', 'report.md'],
    'the second example is that run report and its cost file, nothing else',
  );
  const run = (await readFile(join(secondDir, 'report.md'), 'utf8')).replaceAll('**', '');
  const shown = excerpt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const [shownText, runLine] of [
    ['2019-04-18 Homepage', 'Homepage first seen in the archive on 2019-04-18.'],
    ['2020-07-01 Pricing page', 'Pricing page first seen in the archive on 2020-07-01.'],
    ['2025-04-17 Page /agents', 'Page /agents first seen in the archive on 2025-04-17.'],
    ['"Linear – A fast issue tracker"', 'Hacker News story "Linear – A fast issue tracker"'],
    ['491 points, 221 comments', '(491 points, 221 comments) dated 2020-06-30.'],
    ['"Linear Mobile"', 'App Store listing "Linear Mobile"'],
    ['rated 4.8, 2,303 ratings', 'App Store listing "Linear Mobile" (rated 4.8, 2,303 ratings).'],
    ['rated 4.6, 1,350 ratings', 'Google Play listing "Linear" (rated 4.6, 1,350 ratings).'],
    ['19 dated pages', 'Pages were first seen in 17 different months: 19 dated pages, the earliest 2019-04-18'],
  ]) {
    assert.ok(shown.includes(shownText), `the excerpt prints ${shownText}`);
    assert.ok(run.includes(runLine), `the excerpt quotes a line the run printed: ${shownText}`);
  }
  for (const href of [
    'https://web.archive.org/web/20190418214204/https://linear.app/',
    'https://web.archive.org/web/20200701053740/https://linear.app/pricing',
    'https://web.archive.org/web/20250417194435/https://linear.app/agents',
  ]) {
    assert.ok(run.includes(href) && excerpt.includes(`href="${href}"`), `${href} is the capture that run saw`);
  }
  for (const id of ['s5', 's6', 's11', 's24', 's56', 's57', 'i3']) {
    assert.ok(run.includes(`${id} `), `${id} is a record in that run`);
    assert.match(excerpt, new RegExp(`>${id}<`), `${id} is cited in the excerpt`);
  }
  assert.match(excerpt, /class="parent">s23</, 'the Inferred record names the ids it stands on');
  const secondCosts = JSON.parse(await readFile(join(secondDir, 'costs.json'), 'utf8'));
  assert.ok(
    excerpt.includes(`Total: ${secondCosts.total.toFixed(2)} USD`),
    'the cost line is the total in the committed cost file',
  );

  // The first real command is near the top, not only in the install steps.
  const command = 'node bin/growthmap.js run example.com --out report';
  assert.ok(html.indexOf(command) < html.indexOf('id="use"'), 'the first command is printed in the opening');

  // Both labels the rule rests on, and the links the page promises.
  assert.match(html, /Every claim is <em>Seen<\/em>, with a link, or <i>Inferred<\/i>/);
  for (const href of [
    'https://github.com/umeranjum17/growthmap',
    'https://x.com/umership',
    'https://web.archive.org/web/20190722082333/https://plausible.io/',
  ]) {
    assert.ok(html.includes(`href="${href}"`), `${href} is linked`);
  }
  assert.doesNotMatch(html, /\u2014/, 'plain hyphen only, never an em dash');
});

test('sources, doctor and --as-of are the surface the plan names', async () => {
  const cli = (args, options) => run(process.execPath, [CLI, ...args], options);

  // sources: one row per source the run can read, its cost, whether it needs a key.
  const { stdout: table } = await cli(['sources']);
  const rows = table.trimEnd().split('\n').map((line) => line.split(/\s{2,}/).filter(Boolean));
  assert.deepEqual(rows[0], ['source', 'cost', 'needs a key'], 'the table names its columns');
  assert.deepEqual(rows.slice(1).map(([name]) => name), SOURCES.map((source) => source.name));
  for (const [, cost, key] of rows.slice(1)) {
    assert.equal(cost, '0.00', 'every source is free today');
    assert.equal(key, 'no', 'no source needs a key');
  }

  // --help names every command and every flag the skill offers.
  const { stdout: usage } = await cli(['--help']);
  for (const line of [
    'growthmap run <app-url-or-host> [--out <dir>] [--as-of YYYY-MM-DD]',
    'growthmap playbook <report-dir> [--accept <plays.json>]',
    'growthmap sources',
    'growthmap doctor',
  ]) {
    assert.ok(usage.includes(line), `--help names: ${line}`);
  }

  await withFixtureSite(async (origin, archiveEndpoint, stub) => {
    const options = {
      env: {
        ...process.env,
        GROWTHMAP_ARCHIVE_URL: archiveEndpoint,
        GROWTHMAP_HN_URL: stub.hnEndpoint,
        GROWTHMAP_REDDIT_URL: stub.redditEndpoint,
        GROWTHMAP_YOUTUBE_URL: stub.youtubeEndpoint,
        GROWTHMAP_ITUNES_URL: stub.itunesEndpoint,
        GROWTHMAP_PLAY_URL: stub.playEndpoint,
        GROWTHMAP_PLAY_DETAILS_URL: stub.playDetailsEndpoint,
      },
    };

    // --as-of pins the day every page and fact is recorded as read.
    const dir = await mkdtemp(join(tmpdir(), 'growthmap-asof-'));
    await cli(['run', origin, '--as-of', '2026-01-15', '--out', dir], options);
    const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
    assert.ok(report.run.pages.length > 0);
    for (const page of report.run.pages) {
      assert.equal(page.fetched_at, '2026-01-15', `${page.url} is dated the pinned day`);
    }
    const evidence = report.claims.flatMap((claim) => claim.evidence ?? []);
    assert.ok(evidence.length > 0, 'the run recorded evidence');
    for (const entry of evidence) {
      assert.equal(entry.fetched_at, '2026-01-15', 'every fact is dated the pinned day');
    }

    // A malformed value is refused before any network call, and writes nothing.
    for (const bad of ['nonsense', '2026-02-30']) {
      const untouched = join(dir, 'never');
      await assert.rejects(cli(['run', origin, '--as-of', bad, '--out', untouched], options), (error) => {
        assert.equal(error.code, 2, `${bad} is refused with exit code 2`);
        assert.match(error.stderr, new RegExp(`--as-of "${bad}" is not a date`));
        return true;
      });
      await assert.rejects(readdir(untouched), 'the refused run wrote nothing');
    }
  });
});
