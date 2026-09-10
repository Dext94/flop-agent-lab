# FLOP Agent Lab

Unofficial research and tooling for the FLOP Labs ecosystem, focused on
agent infrastructure, TCLK activity and early network experimentation.

> Experimental software. This repository is not affiliated with or endorsed by FLOP Labs.

## What it does

The current project includes a persistent, read-only TCLK radar for observing
activity on Technocore without exposing signing keys or automatically executing jobs.

The radar:

- verifies signed Technocore transcript records before processing them
- enforces sender / signature consistency
- detects live TCLK payer offers
- classifies interesting job categories
- fetches supported job specifications through a restricted read-only path
- flags potentially unsafe instructions such as writes, signing requests and secret reveals
- monitors Technocore health and capacity signals
- persists its cursor locally so scanning can resume after a restart
- keeps automatic execution disabled

The goal is observation and experimentation first, not blind task execution.

## Safety model

Technocore content is treated as untrusted input.

The live radar does not load an agent signing key and does not contain an
automatic accept / reveal / settlement path.

Job specifications are inspected as data and may be classified for manual review.

TCLK `paper` rail activity should not be interpreted as economically valuable
FLOP settlement.

Private keys, signing seeds and local task secrets must never be committed to
this repository.

## Requirements

- Node.js >= 22
- pnpm 11.25.x
- Linux / WSL recommended

### TCLK dependency

Some radar functionality currently relies on transcript-verification APIs from
the FLOP Labs TCLK repository that are newer than the published
`@flop-labs/tclk@0.1.0` package.

The current development setup expects an official TCLK checkout next to this
repository:

```text
flop/
├── flop-agent-lab/
└── tclk/
```

The radar has been tested against TCLK commit:

`5cc4ab93efbc8999a3a7e1471b639deca25998ea`

## Setup

Install project dependencies:

`pnpm install`

The current development setup also requires the official TCLK repository in the sibling `../tclk` directory, built at the tested commit above.

## Usage

Check the configured agent identity:

`pnpm agent:check`

Run the strict offer scanner:

`pnpm scan:strict`

Start the persistent read-only radar:

`pnpm worker:live`

## Architecture

- `src/live-worker.mjs` — persistent read-only radar
- `src/lib/job-risk.mjs` — job-risk classification
- `src/lib/job-spec.mjs` — restricted read-only specification fetching
- `src/lib/radar-state.mjs` — durable cursor state
- `src/lib/technocore-health.mjs` — Technocore health checks

## Current status

Active experimental development focused on authenticated TCLK activity observation, safe analysis of untrusted job specifications, FLOP testnet readiness, and useful open-source tooling.

This project intentionally favors conservative behavior over automatic execution.

## Disclaimer

This is an independent community project. FLOP, TCLK and Technocore specifications may change as the ecosystem develops.

Nothing in this repository should be interpreted as financial advice, guaranteed airdrop eligibility or evidence of economic settlement.
