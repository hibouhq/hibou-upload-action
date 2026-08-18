# hibou-upload-action

A GitHub / Forgejo Action that uploads **SBOM, SARIF, coverage, and JUnit** test
results to a [Hibou](https://hibouhq.com) instance.

It downloads a version-matched `hibou` CLI from your Hibou `server` and runs
`hibou upload`, auto-detecting `org` / `repo` / `ref` / `sha` from the CI
environment (GitHub `GITHUB_*`, Forgejo/Gitea `GITEA_*`, GitLab `CI_*`).

## Usage

```yaml
- uses: hibouhq/hibou-upload-action@v0.1
  with:
    server: ${{ vars.HIBOU_SERVER_URL }}   # e.g. https://hibouhq.com
    token: ${{ secrets.HIBOU_API_TOKEN }}
    file: |
      coverage.out
      junit.xml
      *.sarif
      *.cdx.json
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `server` | yes | — | Hibou instance URL. |
| `token` | yes | — | Hibou API token. |
| `file` | yes | — | Artifact path(s). Supports glob patterns and newline-separated paths. |
| `complete` | no | `true` | Complete the snapshot after uploading. Set `false` for intermediate uploads in multi-job pipelines. |
| `expect` | no | `0` | Expected number of distinct uploads; the server auto-completes when this many arrive. For parallel pipelines where no single job knows it is last. |
| `org` | no | auto | `provider/slug` (e.g. `github/my-org`). Auto-detected when omitted. |
| `repo` | no | auto | Repository slug. Auto-detected when omitted. |
| `ref` | no | auto | Git ref. Defaults to `GITHUB_REF` / `GITEA_REF`. |
| `sha` | no | auto | Commit SHA. Defaults to `GITHUB_SHA` / `GITEA_SHA`. |
| `reachability` | no | `false` | CI-side reachability analyses as `lang` or `lang:dir` entries, comma-separated. `go` = govulncheck (symbol-level, needs it on PATH), `java` = bytecode class references — build-tool agnostic, dir points at any compiled output (Maven `target/classes`, Gradle `build/classes/java/main`, or a jar), `rust` = crate references. Example: `go:go,java:java/target/classes,rust:rust`. **Monorepos:** for Java point at the repo root (`java:.`) — the scan recurses across every module's compiled output; Rust's `cargo metadata` covers all workspace crates from the root; Go needs one entry per nested `go.mod`. |
| `working-directory` | no | — | Directory the reachability analyzer runs in (e.g. a module subdirectory). |

`file` is required unless the step only runs `reachability` — a
reachability-only step attaches call-graph verdicts to the snapshot an earlier
upload step created:

```yaml
- uses: hibouhq/hibou-upload-action@v0.1     # 1. upload artifacts
  with:
    server: ${{ vars.HIBOU_SERVER_URL }}
    token: ${{ secrets.HIBOU_API_TOKEN }}
    file: '*.sarif'

- uses: hibouhq/hibou-upload-action@v0.1     # 2. attach reachability verdicts
  with:
    server: ${{ vars.HIBOU_SERVER_URL }}
    token: ${{ secrets.HIBOU_API_TOKEN }}
    reachability: go
    working-directory: go
```
| `bytecode-path` | no | — | Java bytecode path override for non-standard build layouts. |

## Versioning

Pre-1.0: the API may change between minor versions, so `@v0` moves across
breaking releases. Pin the **minor** tag (`@v0.1`) for automatic patch updates,
or a full tag (`@v0.1.0`) / commit SHA for strict reproducibility.

Once 1.0 ships, pinning the major tag (`@v1`) becomes the recommended default.

## Notes

- Requires network egress to your Hibou `server` (CLI download + upload).
- Works from **public and private** repositories.

## Development

TypeScript action bundled with [`@vercel/ncc`](https://github.com/vercel/ncc) into
`dist/index.js`, which **is committed** (GitHub runs it directly).

```bash
npm ci
npm test          # vitest unit tests
npm run build     # regenerate dist/ — commit the result
```

CI fails if `dist/` is out of date, so always `npm run build` and commit before pushing.

## Releasing

One action per repo → bare semver tags:

| Tag | Kind | Tracks |
|-----|------|--------|
| `vX.Y.Z` | immutable | the exact release |
| `vX.Y` | moving | latest patch of that minor |
| `vX` | moving | latest minor+patch of that major |

Cut a release with the script (dogfoods `gh`):

```bash
./release.sh 1.2.3            # explicit version
./release.sh --bump patch     # or derive from the latest vX.Y.Z tag
./release.sh --bump minor -n  # --dry-run to preview
```

…or run the **Release** workflow (`Actions → Release → Run workflow`) with a version or
bump type. The release rebuilds `dist/` and **fails if the committed bundle is stale**.
