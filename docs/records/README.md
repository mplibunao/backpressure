# Deferred work records

Tech-debt records are hand-managed markdown under `tech-debt/<status>/` (`open`, `done`, `rejected`, `superseded`). The markdown is the source of truth: nothing generates or validates it.

- Read `open/` before planning, and update the affected records before finishing a change.
- IDs are never reused. Check every status directory before choosing the next number; gaps are not free numbers.
- A status change moves the file and updates `status`, the status tag, the resolution, and the evidence together.
- `visibility: local-only` is descriptive metadata, not access control.
- New deferrals still need MP's approval.
