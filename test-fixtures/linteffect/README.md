# linteffect fixture mirror

This directory is a pinned test fixture mirror of `OperationalFallacy/biome-effect-linting-rules`.

Purpose:

- Keep CI self-contained. The rule inventory and fixture replay checks must not depend on MP's local `/Users/mp/references/...` checkout.
- Preserve the upstream rule/config/fixture corpus that the port is measured against.

Update policy:

- Refresh this mirror intentionally when updating the upstream linteffect baseline.
- Keep `LINTEFFECT_SOURCE_ROOT` support in scripts so local investigations can compare against a different checkout when needed.
- Do not publish these fixtures in npm packages; package allowlist checks should keep them out of packed artifacts.
