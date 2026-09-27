// Deterministic JSON for committed generated files: sorted object keys at every depth, two-space
// indentation, and a trailing newline. Arrays keep their authored order because order is data.
import { isObjectRecord } from './script-runtime.ts';

const jsonIndentSpaces = 2;

export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (!isObjectRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, sortKeysDeep(value[key])]),
  );
};

// Without the trailing newline, for embedding as a literal in generated source.
export const literal = (value: unknown): string =>
  JSON.stringify(sortKeysDeep(value), null, jsonIndentSpaces);

export const stableJson = (value: unknown): string => `${literal(value)}\n`;
