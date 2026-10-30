// One integration test: drives the real CLI against a local fixture site.
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
  '/': `<!doctype html><html><head><title>Acme - ship your app faster</title></head>
    <body><h1>Ship faster</h1><p>Acme helps small teams ship their app to production faster with one command.</p></body></html>`,
  '/pricing': `<!doctype html><html><head><title>Acme pricing</title></head>
    <body><p>Simple pricing for every team.</p><ul><li>$9 per seat each month</li><li>$29 per seat each month</li></ul></body></html>`,
  '/about': `<!doctype html><html><head><title>About Acme</title></head>
    <body><p>We are a small team building shipping tools for developers everywhere.</p></body></html>`,
};

async function withFixtureSite(fn) {
  const server = createServer((request, response) => {
    const page = FIXTURES[request.url];
    if (!page) {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<title>Not found</title><p>Not found</p>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(origin);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('growthmap run writes a labelled, costed report for a real site', async () => {
  await withFixtureSite(async (origin) => {
    const out = await mkdtemp(join(tmpdir(), 'growthmap-test-'));
    const { stdout } = await run(process.execPath, [CLI, 'run', origin, '--out', out]);

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
    assert.equal(costs.lines.length, 4, 'one metered call per page, the 404 included');
    assert.ok(costs.lines.every((line) => line.source && line.call));

    for (const claim of report.claims) {
      assert.ok(markdown.includes(claim.id), `${claim.id} is printed in report.md`);
    }
    assert.ok(report.run.pages.some((page) => page.status === 'not_found'), 'the 404 is recorded, not claimed');
  });
});
