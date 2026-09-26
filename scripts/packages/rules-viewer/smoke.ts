#!/usr/bin/env bun
// Starts the rules viewer on an ephemeral port and checks that the page, its bundled script, and
// the rule list all respond. The server is always stopped, even when a check fails.
import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { fail, isObjectRecord, printLine, repoRoot } from '../../lib/script-runtime.ts';

const serverEntry = join(repoRoot, 'packages', 'rules-viewer', 'src', 'server.ts');
const startupTimeoutMs = 60_000;
const pollIntervalMs = 250;
const urlPattern = /Rules viewer: (?<url>http:\/\/\S+)/u;
const scriptSourcePattern = /<script[^>]*\ssrc="(?<src>[^"]+)"/u;
const expectedSources = ['oxlint', 'package', 'tsgo'];

const startServer = (): ChildProcess =>
  spawn('bun', [serverEntry], {
    cwd: repoRoot,
    env: { ...process.env, RULES_VIEWER_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

// Returns a reader for everything the server has written so far.
const captureOutput = (server: ChildProcess): (() => string) => {
  const chunks: string[] = [];
  const append = (chunk: Buffer): void => {
    chunks.push(chunk.toString());
  };
  server.stdout?.on('data', append);
  server.stderr?.on('data', append);
  return () => chunks.join('');
};

// Resolves with the URL the server prints once it is listening.
const waitForUrl = async (server: ChildProcess): Promise<string> => {
  const readOutput = captureOutput(server);
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    const url = urlPattern.exec(readOutput())?.groups?.['url'];
    if (url !== globalThis.undefined) {
      return url;
    }
    if (server.exitCode !== null) {
      return fail(
        `The rules viewer exited with ${server.exitCode} before listening.\n${readOutput()}`,
      );
    }
    await delay(pollIntervalMs);
  }
  return fail(
    `The rules viewer did not print its URL within ${startupTimeoutMs} ms.\n${readOutput()}`,
  );
};

const fetchOk = async (url: URL, label: string): Promise<Response> => {
  const response = await fetch(url);
  return response.ok ? response : fail(`${label} returned HTTP ${response.status}.`);
};

const checkRuleList = async (baseUrl: string): Promise<number> => {
  const body: unknown = await (
    await fetchOk(new URL('/rules.json', baseUrl), '/rules.json')
  ).json();
  const rules = isObjectRecord(body) ? body['rules'] : globalThis.undefined;
  if (!Array.isArray(rules)) {
    return fail('/rules.json has no rules array.');
  }
  const sources = new Set(rules.map((rule) => (isObjectRecord(rule) ? rule['source'] : null)));
  const missing = expectedSources.filter((source) => !sources.has(source));
  return missing.length === 0
    ? rules.length
    : fail(`/rules.json has no ${missing.join(', ')} rows.`);
};

// The page must reference its bundled script, and that script must be served, or the page renders
// an empty table.
const checkPage = async (baseUrl: string): Promise<void> => {
  const html = await (await fetchOk(new URL('/', baseUrl), '/')).text();
  if (!html.includes('id="rule-rows"')) {
    fail('/ is not the rules viewer page.');
  }
  const scriptSource =
    scriptSourcePattern.exec(html)?.groups?.['src'] ?? fail('/ references no bundled script.');
  await fetchOk(new URL(scriptSource, baseUrl), `The page script ${scriptSource}`);
};

const server = startServer();
try {
  const baseUrl = await waitForUrl(server);
  const ruleCount = await checkRuleList(baseUrl);
  await checkPage(baseUrl);
  printLine(`rules viewer smoke passed: ${ruleCount} rules from ${baseUrl}`);
} finally {
  server.kill();
}
