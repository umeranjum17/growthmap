# Release

There are two routes. The GitHub tarball works today and needs no account; the
npm route is prepared and switches on after the one-time manual publish below.

## Install today, from the GitHub release

`.github/workflows/release.yml` packs the repository on every push to `main`
and attaches the tarball to a GitHub release for the version in
`package.json`. The asset name is fixed, so one URL always serves the newest
build:

```sh
npm install -g --allow-remote=all https://github.com/umeranjum17/growthmap/releases/latest/download/growthmap.tgz
growthmap doctor
growthmap sources
growthmap run example.com --out report
```

`--allow-remote=all` is not optional. npm 12 refuses to fetch a package from a
remote URL without it, and fails with `EALLOWREMOTE`. growthmap has no
dependencies, so unlike a package with install scripts it needs no
`--allow-scripts`.

That job is idempotent: if the release for this version already carries
`growthmap.tgz` it prints a line and stays green. If the release exists but
the asset is missing it uploads the asset. It creates nothing with
`--clobber`, so a different asset of the same name is never overwritten. It
authenticates with `github.token`, so no token or secret is stored in the
repository.

To release a new version on this route, bump `version` in `package.json` and
merge; the release appears as `v<version>`.

## The npm route, prepared and waiting

Published to npm as `growthmap`, from this repository, by the same
`.github/workflows/release.yml`. It runs on every push to `main`, and can be
started by hand with **Run workflow**. It authenticates with npm trusted
publishing (OIDC), so no token or secret is stored in the repository. Until
the one-time publish below has happened, it skips green with a notice
pointing here, so `npm install -g growthmap` and `npx growthmap` do not work
yet.

### Why the first publish is manual

npm only lets you attach a trusted publisher to a package that already exists.
So the very first publish of the name `growthmap` cannot come from CI. Do it
once, by hand, and every version after it publishes itself.

Docs: <https://docs.npmjs.com/trusted-publishers>

### One-time bootstrap, by the account owner

From a clean checkout of `main`:

```sh
git clone https://github.com/umeranjum17/growthmap
cd growthmap
npm login
npm publish --access public
```

`npm login` asks for the account's sign-in. A 2FA prompt is expected on
publish. The account owner runs these, never an agent.

Then attach the trusted publisher at <https://www.npmjs.com/package/growthmap>
→ **Settings** → **Trusted publishing** → **Add a trusted publisher**, with
exactly:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `umeranjum17` |
| Repository | `growthmap` |
| Workflow filename | `release.yml` |
| Environment | leave empty |

## After that

Merge to `main` publishes the version in `package.json`, with provenance. If
that exact version is already on npm the workflow skips and stays green.

To release a new version, bump `version` in `package.json` in the same merge.

## Confirm it worked

The GitHub tarball, which works today:

```sh
gh release view "v$(node -p 'require("./package.json").version')" --json assets
mkdir /tmp/gm && cd /tmp/gm  # from an empty directory
npm install -g --allow-remote=all https://github.com/umeranjum17/growthmap/releases/latest/download/growthmap.tgz
growthmap --help
```

The npm route, once the bootstrap above has happened:

```sh
npm view growthmap version   # prints the published version
mkdir /tmp/gm && cd /tmp/gm  # from an empty directory
npx growthmap --help
```
