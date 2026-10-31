// The one list of every source a run can read: the name its calls are metered
// under, what one call costs, and whether it needs a key. src/site.js,
// src/sitemap.js, src/archive.js, src/reach.js and src/sources.js meter their
// calls under these names; the test proves this list covers what a run emits.

export const SOURCES = [
  { name: 'site', cost: 0, needsKey: false },
  { name: 'sitemap', cost: 0, needsKey: false },
  { name: 'archive', cost: 0, needsKey: false },
  { name: 'hackernews', cost: 0, needsKey: false },
  { name: 'reddit', cost: 0, needsKey: false },
  { name: 'youtube', cost: 0, needsKey: false },
  { name: 'appstore', cost: 0, needsKey: false },
  { name: 'playstore', cost: 0, needsKey: false },
  { name: 'hiring', cost: 0, needsKey: false },
];
