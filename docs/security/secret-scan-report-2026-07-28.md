# Pivotal Secret Scan Report

## Status

**Public release is blocked.** The current working tree is clear after the
remediation in this change, but valid private keys remain reachable in Git
history. The GitHub repository was confirmed as public on 2026-07-28, so these
keys must be treated as exposed until their owners confirm rotation, revocation,
or that they were never trusted outside disposable local test environments.

This report contains no private key, token, password, or certificate material.
Public-key fingerprints are included only to support safe rotation checks.

## Scope

- Repository: `https://github.com/ThitsaX/pivotal`
- Checkout HEAD at scan start: `a5228c3`
- Scan date: 2026-07-28
- Scanner: Gitleaks `8.30.1`
- Working tree: all files, including recursive decoding to depth 3 and archive
  inspection to depth 2
- History: all reachable refs with `--all --full-history`; Gitleaks reported
  293 commits scanned

Commands:

```bash
gitleaks dir . \
  --max-decode-depth 3 \
  --max-archive-depth 2 \
  --redact=100 \
  --report-format json

gitleaks git . \
  --log-opts="--all --full-history" \
  --max-decode-depth 3 \
  --max-archive-depth 2 \
  --redact=100 \
  --report-format json
```

The repeatable repository command is:

```bash
./scripts/scan-secrets.sh
```

## Results

| Scan | Initial findings | Reviewed result |
| --- | ---: | --- |
| Current working tree | 8 | 4 valid-key occurrences removed; 3 invalid documentation placeholders replaced; 1 test fixture allowlisted |
| Full Git history | 39 | 32 actionable occurrences representing 6 distinct valid private keys; 7 documented false positives |
| Remediated working tree | 0 | Pass |
| Reviewed Git history | 32 | Fail until history is sanitized |

The 32 actionable historical findings occur in:

| Path | Findings |
| --- | ---: |
| `packages/apps/web-inbound/.env` | 7 |
| `packages/apps/web-inbound/.env.example` | 2 |
| `packages/apps/web-legacy/.env` | 2 |
| `packages/apps/web-outbound/.env` | 7 |
| `packages/apps/web-outbound/.env.example` | 2 |
| `packages/samples/wallet1-connector/.env` | 5 |
| `packages/samples/wallet2-connector/.env` | 5 |
| `packages/samples/wallet3-connector/.env` | 2 |

## Valid Findings

Six distinct parseable private keys were found. Two were still present in the
tracked inbound/outbound `.env.example` files and were removed by this change.
Four were already history-only. No matching public-key fingerprints were found
in other local workspace deployment/config repositories; this does not verify
cloud or external systems.

SHA-256 fingerprints of the corresponding SPKI public keys:

```text
7f0a17aa06737db0eaa27a7bd4a8addbe3203694f3b6b46b1f502a09bd84fb34
d16ca84a789063167890f88cbf0ade582acea965d20356fa5a5e2b544a1c1e1b
f075d83a0f6e1cf83c1d246b5e8a53c09f8bc1ff43e6b66fddb8522e56518039
8aa5d36977d33d18904fe0cb9d1a1a0a85fdf8bafa5444a3bc5dad61caaff69b
0762142ab7a2a1d156d461cf9942c73ee450df6c3869adf3832ba706bc3387ad
4d06adc08288a50642d40164989a72dc91dca9e9b7e890a423b6765cf89e67d9
```

Required owner action:

1. Compare these public fingerprints with every JWS participant key, mTLS
   client key, local secret store, CI secret, and deployed Kubernetes secret.
2. Rotate or revoke every match and record the rotation evidence in the release
   ticket.
3. If a key was intentionally disposable and never trusted outside local tests,
   record that evidence explicitly.

## False Positives

Seven findings were reviewed and documented:

| Finding | Count | Classification |
| --- | ---: | --- |
| `FSPIOP_MTLS_CLIENT_KEY` variable name | 2 | The generic API key detector matched the 25-character variable name, not its value. Exact historical fingerprints are in `.gitleaksignore`. |
| Incomplete PEM documentation examples | 4 | Placeholder text could not be parsed as a private key. Exact historical fingerprints are in `.gitleaksignore`; current examples now use scanner-safe tokens. |
| Static certificate test fixture | 1 | Deterministic key/certificate pair used only by shared security unit tests. The `private-key` rule is allowlisted only for that exact test path in `.gitleaks.toml`. |

Test fixture public fingerprint:

```text
441a2b06400c753baeee09b8d114023dc62b18ecdd0835b66591d24e208269f3
```

## Remediation Applied

- Removed valid JWS and mTLS private keys and certificates from both tracked
  service `.env.example` files.
- Replaced credential-shaped documentation examples with explicit placeholders.
- Added `.gitleaks.toml` with a rule-specific, path-specific test-fixture
  allowlist.
- Added `.gitleaksignore` entries for six exact historical false-positive
  fingerprints.
- Added `scripts/scan-secrets.sh` to scan the tree and full history with redacted
  output.
- Added CI scans for the current tree and newly introduced push/PR commits.
- Added a Gitleaks pre-commit hook for staged changes.
- Confirmed the remediated working tree returns zero Gitleaks findings.

## History Remediation

A normal removal commit does not remove secrets from old Git objects. Before the
repository is considered cleared, choose one coordinated release approach:

1. Preferred: create the public repository from a clean, remediated source
   snapshot and do not publish the existing history or refs.
2. If history must be retained: use `git filter-repo` in a mirror clone to purge
   every sensitive `.env` path listed above and the historical versions of the
   two affected `.env.example` files, re-add the safe examples, verify all
   branches/tags, then coordinate a force-push and mandatory fresh clones.

Since the current GitHub repository is already public, temporarily making it
private should be considered while rotation and history cleanup are performed.

### Isolated rewrite verification

The history-remediation approach was tested in a disposable local clone. No
shared refs or remotes were modified.

- `git filter-repo` processed 402 commits.
- The sensitive `.env` paths in the results table were removed from all refs.
- Historical versions of both affected `.env.example` files and
  `packages/shared/security/.required.env` were removed.
- The remediated current versions were restored in the disposable checkout.
- Gitleaks working-tree result: 0 findings.
- Gitleaks full-history result: 0 findings across 290 reported commits.

This proves the purge path can produce a clean repository, but it is not a
substitute for coordinating and applying the rewrite to GitHub.

## Preventive Controls

The repository now includes:

- A Gitleaks CI workflow that scans the current tree and only the commits
  introduced by a push or pull request. It does not rescan known legacy history,
  so the 32 historical findings do not make every CI run fail.
- A pre-commit hook that scans staged changes only.
- A separate manual full-history command that continues to report unresolved
  historical exposure.

GitHub Secret Protection and repository push protection require repository
administrator access. The active local GitHub CLI account reported
`push=false` and `admin=false`, so the settings API could not enable them.
An administrator must complete:

1. Open **Settings > Security > Advanced Security**.
2. Enable **Secret Protection**.
3. Enable **Push protection** under Secret Protection.

## Release Checklist

- [x] Current source scanned.
- [x] Full reachable Git history scanned.
- [x] Findings reviewed and false positives documented.
- [x] Valid keys removed from the current source.
- [x] Remediated working tree verified with zero findings.
- [x] Prospective Gitleaks CI and pre-commit checks added.
- [ ] GitHub Secret Protection enabled by a repository administrator.
- [ ] GitHub repository push protection enabled by a repository administrator.
- [ ] Six exposed key fingerprints checked against all deployed trust stores.
- [ ] Matching keys rotated/revoked, or never-used evidence recorded.
- [ ] Existing Git history purged or excluded from the public repository.
- [ ] Final full-history scan returns zero actionable findings.
- [ ] Redacted final scan artifacts attached to the release ticket.
