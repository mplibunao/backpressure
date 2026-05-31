// Pure manifest-querying helpers with no dependency on plugin or preset wiring.
// Presets and tests import from here. Scripts import directly from rule-manifest.ts
// To bypass Node's native TS loader limitation with internal .js specifiers.
export { oxlintSeverityForManifestEntry, presetEntriesForDomains } from './rule-manifest.js';
