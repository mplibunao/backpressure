// Serves the collected rule list and its viewer page on localhost. The list is collected once at
// startup and served from memory, so nothing is written to disk.
import { collectRules } from '../../../scripts/lib/rules-collector.ts';
import { fail, printLine } from '../../../scripts/lib/script-runtime.ts';
import { buildOxlintStandards } from '../../../scripts/packages/oxlint-standards/package.ts';
import viewerPage from '../index.html';

const defaultPort = 4178;
const portPattern = /^\d+$/u;

// RULES_VIEWER_PORT=0 asks for an ephemeral port; the smoke test reads the printed URL.
const readPort = (setting: string | undefined): number => {
  if (setting === globalThis.undefined) {
    return defaultPort;
  }
  return portPattern.test(setting)
    ? Number.parseInt(setting, 10)
    : fail(`RULES_VIEWER_PORT must be a port number, not ${JSON.stringify(setting)}.`);
};

buildOxlintStandards();
const ruleList = await collectRules();

const server = Bun.serve({
  development: false,
  hostname: '127.0.0.1',
  port: readPort(process.env['RULES_VIEWER_PORT']),
  routes: {
    '/': viewerPage,
    '/rules.json': Response.json(ruleList),
  },
});

printLine(`Rules viewer: ${server.url.href}`);
