---
schema_version: 1
id: BP-TD-015
repo_key: BP
record_type: tech-debt
number: 15
title: Research whether Effect.forkDetach should be flagged
status: open
category: tech-debt
visibility: local-only
created_at: 2026-09-26T12:13:08Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-09-26T12:13:08Z
---
## Problem

The Effect v4 alignment dropped `no-runtime-runfork` because v4 has no `Runtime.runFork` and `effecttsgo/run-effect-inside-effect` reports `Effect.runFork` inside Effect code. Its closest v4 neighbor, `Effect.forkDetach`, starts a fiber that outlives its parent scope. That can hide a leaked or unsupervised fiber, but both reference apps (t3code and executor) use it on purpose. No custom rule or `@effect/tsgo` check reports it today, and the Effect house style does not mention it.

## Why deferred

Flagging it without research would ban legitimate uses. The alignment's decided list says it is not retargeted without research, and its deferred list names this follow-up. The house style may not add a `forkDetach` ban until that research is done.

## Revisit trigger

Revisit when the next Effect rule work starts, or when an app audit or review finds a leaked detached fiber in code linted by the Effect preset.

## Done when

Done when the uses of `Effect.forkDetach` in the reference apps and the Effect v4 sources are classified as legitimate or not, and the result is recorded as a decision. The decision may add a narrow custom rule with valid and invalid cases or a house-style line, or it may add nothing.
