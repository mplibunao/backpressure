#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { fail } from './script-runtime.ts';

export type JsonObject = Record<string, unknown>;

export const isObjectRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null;

export const readJsonObject = (path: string, label: string): JsonObject => {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));

  if (!isObjectRecord(value)) {
    return fail(`${label} must be a JSON object.`);
  }

  return value;
};

export const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

export const assertExactStringArray = (
  actual: unknown,
  expected: ReadonlyArray<string>,
  label: string,
): void => {
  const actualArray = Array.isArray(actual)
    ? actual
    : fail(`${label} must be exactly ${JSON.stringify(expected)}.`);

  if (!actualArray.every((item) => typeof item === 'string')) {
    fail(`${label} must contain only strings.`);
  }

  if (actualArray.length !== expected.length) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}.`);
  }

  for (const [index, expectedValue] of expected.entries()) {
    if (actualArray.at(index) !== expectedValue) {
      fail(`${label} must be exactly ${JSON.stringify(expected)}.`);
    }
  }
};

export const assertExactStringMap = (
  actual: unknown,
  expected: Readonly<Record<string, string>>,
  label: string,
): void => {
  const actualMap = isObjectRecord(actual) ? actual : fail(`${label} must be an object.`);
  const actualEntries = Object.entries(actualMap);
  const expectedEntries = Object.entries(expected);

  if (actualEntries.length !== expectedEntries.length) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}.`);
  }

  for (const [key, expectedValue] of expectedEntries) {
    if (actualMap[key] !== expectedValue) {
      fail(`${label} entry ${key} must be ${expectedValue}.`);
    }
  }
};

export const assertExactPackedFiles = (
  actual: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
  label: string,
): void => {
  assertExactStringArray([...actual].sort(), [...expected].sort(), label);
};
