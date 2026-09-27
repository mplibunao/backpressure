// Renders the rule list served at /rules.json with a search box and source, preset, and severity
// filters. Text from the list is inserted with textContent only: tsgo descriptions and examples are
// third-party text.
import {
  type CollectedRule,
  type RuleActivation,
  type RuleExample,
  type RuleList,
  type RuleSeverity,
  ruleSources,
} from '../../../scripts/lib/rule-list.ts';

interface FilterState {
  readonly preset: string;
  readonly query: string;
  readonly severity: string;
  readonly source: string;
}

interface Controls {
  readonly preset: HTMLSelectElement;
  readonly search: HTMLInputElement;
  readonly severity: HTMLSelectElement;
  readonly source: HTMLSelectElement;
}

const byId = <T extends HTMLElement>(id: string, type: { new (): T; prototype: T }): T => {
  const found = document.getElementById(id);
  if (found instanceof type) {
    return found;
  }
  throw new Error(`The viewer page is missing #${id}.`);
};

const create = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text: string | null = null,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== null) {
    node.textContent = text;
  }
  return node;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCollectedRule = (value: unknown): value is CollectedRule =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  typeof value['source'] === 'string' &&
  Array.isArray(value['activations']);

const isRuleList = (value: unknown): value is RuleList =>
  isRecord(value) &&
  Array.isArray(value['targets']) &&
  Array.isArray(value['rules']) &&
  value['rules'].every(isCollectedRule);

const severityPill = (severity: RuleSeverity): HTMLSpanElement =>
  create('span', `severity severity-${severity}`, severity);

const activationGrid = (activations: readonly RuleActivation[]): HTMLDivElement => {
  const grid = create('div', 'activation-grid');
  grid.append(
    create('span', 'activation-head', 'Preset or config'),
    create('span', 'activation-head', 'Normal'),
    create('span', 'activation-head', 'Tests'),
  );
  for (const activation of activations) {
    grid.append(
      create('span', 'target', activation.target),
      severityPill(activation.normal),
      severityPill(activation.test),
    );
  }
  return grid;
};

const ruleCell = (rule: CollectedRule): HTMLTableCellElement => {
  const cell = create('td');
  const badges = create('div', 'badges');
  badges.append(create('span', 'badge badge-source', rule.source));
  if (rule.category !== null) {
    badges.append(create('span', 'badge', rule.category));
  }
  if (rule.fixable === true) {
    badges.append(create('span', 'badge', 'fixable'));
  }
  cell.append(create('div', 'rule-name', rule.name), badges);
  return cell;
};

// Wraps each reported span in <mark>; overlapping spans keep only the first.
const exampleCode = (example: RuleExample): HTMLElement => {
  const code = create('code');
  let cursor = 0;
  for (const diagnostic of example.diagnostics.toSorted(
    (left, right) => left.start - right.start,
  )) {
    if (diagnostic.start >= cursor) {
      code.append(example.sourceText.slice(cursor, diagnostic.start));
      code.append(create('mark', '', example.sourceText.slice(diagnostic.start, diagnostic.end)));
      cursor = diagnostic.end;
    }
  }
  code.append(example.sourceText.slice(cursor));
  return code;
};

const exampleDetails = (example: RuleExample): HTMLDetailsElement => {
  const details = create('details', 'example');
  const pre = create('pre');
  pre.append(exampleCode(example));
  details.append(create('summary', '', 'Example'), pre);
  for (const diagnostic of example.diagnostics) {
    details.append(create('p', 'example-diagnostic', diagnostic.text));
  }
  return details;
};

const labelledParagraph = (label: string, text: string): HTMLParagraphElement => {
  const paragraph = create('p');
  paragraph.append(create('span', 'label', `${label}: `), text);
  return paragraph;
};

const docsLink = (url: string): HTMLAnchorElement => {
  const link = create('a', 'docs-link', 'Docs');
  link.href = url;
  link.rel = 'noreferrer';
  return link;
};

const descriptionCell = (rule: CollectedRule): HTMLTableCellElement => {
  const cell = create('td', 'description');
  const parts = [
    rule.description === null ? null : create('p', '', rule.description),
    rule.fix === null ? null : labelledParagraph('Fix', rule.fix),
    rule.reference === null ? null : labelledParagraph('Ref', rule.reference),
    rule.docsUrl === null ? null : docsLink(rule.docsUrl),
    rule.example === null ? null : exampleDetails(rule.example),
  ];
  cell.append(...parts.filter((part) => part !== null));
  return cell;
};

const ruleRow = (rule: CollectedRule): HTMLTableRowElement => {
  const row = create('tr');
  const activations = create('td');
  activations.append(activationGrid(rule.activations));
  row.append(ruleCell(rule), activations, descriptionCell(rule));
  return row;
};

const readState = (controls: Controls): FilterState => ({
  preset: controls.preset.value,
  query: controls.search.value.trim().toLowerCase(),
  severity: controls.severity.value,
  source: controls.source.value,
});

// With a preset selected, the severity filter looks only at that preset's settings.
const relevantActivations = (rule: CollectedRule, preset: string): readonly RuleActivation[] =>
  preset === '' ? rule.activations : rule.activations.filter((item) => item.target === preset);

const searchText = (rule: CollectedRule): string =>
  [rule.name, rule.description, rule.fix, rule.category].join(' ').toLowerCase();

const matchesFilters = (rule: CollectedRule, state: FilterState): boolean => {
  const activations = relevantActivations(rule, state.preset);
  return (
    (state.source === '' || rule.source === state.source) &&
    activations.length > 0 &&
    (state.severity === '' ||
      activations.some((item) => item.normal === state.severity || item.test === state.severity)) &&
    (state.query === '' || searchText(rule).includes(state.query))
  );
};

const render = (list: RuleList, controls: Controls): void => {
  const state = readState(controls);
  const shown = list.rules.filter((rule) => matchesFilters(rule, state));
  byId('rule-rows', HTMLTableSectionElement).replaceChildren(...shown.map(ruleRow));
  byId('empty', HTMLParagraphElement).hidden = shown.length > 0;
  byId('summary', HTMLParagraphElement).textContent =
    `${shown.length} of ${list.rules.length} rules turned on by a shipped preset or config. tsgo text from @effect/tsgo ${list.tsgoVersion} (${list.tsgoAttribution}).`;
};

const addOptions = (select: HTMLSelectElement, values: readonly string[]): void => {
  for (const value of values) {
    select.append(new Option(value, value));
  }
};

const bindFilters = (list: RuleList, controls: Controls): void => {
  const form = byId('filters', HTMLFormElement);
  // Some selection paths fire only `change` on a select, so both events re-render.
  form.addEventListener('input', () => render(list, controls));
  form.addEventListener('change', () => render(list, controls));
  // Enter in the search box would otherwise submit the form and reload the page.
  form.addEventListener('submit', (event) => event.preventDefault());
};

const start = async (): Promise<void> => {
  const response = await fetch('/rules.json');
  const list: unknown = await response.json();
  if (!isRuleList(list)) {
    throw new Error('/rules.json did not return a rule list.');
  }
  const controls: Controls = {
    preset: byId('preset', HTMLSelectElement),
    search: byId('search', HTMLInputElement),
    severity: byId('severity', HTMLSelectElement),
    source: byId('source', HTMLSelectElement),
  };
  addOptions(controls.source, ruleSources);
  addOptions(controls.preset, list.targets);
  bindFilters(list, controls);
  render(list, controls);
};

await start();
