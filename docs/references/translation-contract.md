# Translation contract

Status: placeholder reference for Item 6.

This file will define how source GritQL rules map to ESTree visitors, how import gates are represented, and how Effect v4 identifiers are centralized. The baseline keeps the file present so ADRs and design docs can link to the future contract before rule logic exists.

## Open until Item 6

- Whether source `contains "effect"` gates become loose file gates or namespace-import-bound checks.
- How subtree `contains` patterns map to explicit visitor plus descendant scans.
- Where v4 Effect identifier sets live in source.
- How source severities map into preset defaults and manifest entries.
