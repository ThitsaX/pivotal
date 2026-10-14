# Pivotal Documentation

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

## Start here

This is the official documentation for operating Pivotal. It is written for engineers who know
Kubernetes and Helm but have not deployed Pivotal before.

## What is documented

| Section | Covers | Start at |
|---|---|---|
| Security: mTLS and JWS | Mutual TLS and JWS message signing on both sides of Pivotal: the DFSP-facing side and the Hub-facing side, for both key profiles | [security/index.md](security/index.md) |

Other Pivotal features will be added as separate sections.

## Supported versions

| Component | Version |
|---|---|
| Pivotal | v1.0.1 – v1.3.0 |
| Pivotal Helm chart | 0.2.0 |
| Mojaloop Connection Manager (MCM) | v3.7.4 |

## How the documentation is organised

Each section uses the same four kinds of page:

| Kind | Purpose | Example |
|---|---|---|
| Concept | Explains how something works, so you can make decisions | `security/concepts/overview.md` |
| Setup | Step-by-step procedures you run once, in order | `security/setup/` |
| Runbook | Step-by-step procedures you run when needed | `security/runbooks/` |
| Reference | Tables of settings, names and values | `security/reference/` |

Every procedure follows the same structure: Overview, Objective, Expected Outcome, Prerequisites,
Steps, Verification, Troubleshooting, Rollback or Recovery, References.

## Conventions

| Convention | Meaning |
|---|---|
| `<ANGLE_CAPS>` | A value you replace with your own, for example `<FSP_ID>` |
| `example.com` | An example domain; use your own |
| `-----BEGIN CERTIFICATE-----` … | Shortened PEM; the real value is longer |
| **Profile** in the page header | `vault-kv`, `pkcs11`, or `both`. Follow only the pages for your profile. |

## Document history

Changes to this documentation are recorded in [document-history.md](document-history.md).
