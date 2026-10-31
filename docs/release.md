# Release

Published to npm as `growthmap`, from this repository, by
`.github/workflows/release.yml`. It runs on every push to `main`, and can be
started by hand with **Run workflow**. It authenticates with npm trusted
publishing (OIDC), so no token or secret is stored in the repository.

## Why the first publish is manual

npm only lets you attach a trusted publisher to a package that already exists.
So the very first publish of the name `growthmap` cannot come from CI. Do it
once, by hand, and every version after it publishes itself.

Docs: <https://docs.npmjs.com/trusted-publishers>

## One-time bootstrap, by the account owner

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
that exact version is already on npm the workflow skips and stays green, and
until the bootstrap above has happened it also skips green, with a notice
pointing here.

To release a new version, bump `version` in `package.json` in the same merge.

## Confirm it worked

```sh
npm view growthmap version   # prints the published version
mkdir /tmp/gm && cd /tmp/gm  # from an empty directory
npx growthmap --help
```
