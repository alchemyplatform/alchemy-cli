---
name: code-review
description: |
  CRITICAL - MUST be loaded when reviewing ANY code change, creating PRs, or
  evaluating whether a change is safe to deploy. This skill enforces strict
  backward/forward compatibility requirements for all PRs.
---

# Code Review Skill

**THIS SKILL MUST BE LOADED FOR EVERY CODE REVIEW AND PR.**

All changes in this repository must be independently deployable. Services run
different versions simultaneously during rolling deployments. A single
incompatible change can cause production outages, silent data corruption, or
cascading failures across dependent services.

These rules are strictly enforced. No exceptions without explicit team lead approval.

## Rules

| Rule | Description |
|------|-------------|
| [pr-review-attribution](rules/pr-review-attribution.md) | Attribute Codex-authored changes in every PR review or PR description |
