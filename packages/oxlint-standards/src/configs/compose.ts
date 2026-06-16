import type { ExternalPluginEntry, OxlintConfig } from 'oxlint';

type HandledOxlintConfigKey =
  | 'categories'
  | 'env'
  | 'globals'
  | 'ignorePatterns'
  | 'jsPlugins'
  | 'options'
  | 'overrides'
  | 'plugins'
  | 'rules'
  | 'settings';
type IgnoredOxlintConfigKey = 'extends';
type AssertNever<Value extends never> = Value;

type MissingOxlintConfigKey = Exclude<
  keyof OxlintConfig,
  HandledOxlintConfigKey | IgnoredOxlintConfigKey
>;
type UnknownListedOxlintConfigKey = Exclude<
  HandledOxlintConfigKey | IgnoredOxlintConfigKey,
  keyof OxlintConfig
>;

// Drift guard: adding a top-level OxlintConfig field must force an explicit merge-or-ignore decision here.
type _MissingOxlintConfigFieldGuard = AssertNever<MissingOxlintConfigKey>;
type _UnknownOxlintConfigFieldGuard = AssertNever<UnknownListedOxlintConfigKey>;

const isNonEmptyRecord = (value: object): boolean => Object.keys(value).length > 0;

const jsPluginKey = (entry: ExternalPluginEntry): string => {
  if (typeof entry === 'string') {
    return `string:${entry}`;
  }

  return `object:${entry.name}\u0000${entry.specifier}`;
};

const addUnique = <Item>(
  target: Item[],
  seen: Set<Item>,
  values: readonly Item[] | undefined,
): void => {
  if (typeof values === 'undefined') {
    return;
  }

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      target.push(value);
    }
  }
};

const addUniqueByKey = <Item>(
  target: Item[],
  seen: Set<string>,
  values: readonly Item[] | undefined | null,
  keyFor: (value: Item) => string,
): void => {
  if (typeof values === 'undefined' || values === null) {
    return;
  }

  for (const value of values) {
    const key = keyFor(value);
    if (!seen.has(key)) {
      seen.add(key);
      target.push(value);
    }
  }
};

// Mutable accumulators for a single composition pass.
interface CompositionAccumulators {
  categories: NonNullable<OxlintConfig['categories']>;
  env: NonNullable<OxlintConfig['env']>;
  globals: NonNullable<OxlintConfig['globals']>;
  ignorePatterns: NonNullable<OxlintConfig['ignorePatterns']>;
  ignorePatternKeys: Set<string>;
  jsPlugins: NonNullable<OxlintConfig['jsPlugins']>;
  jsPluginKeys: Set<string>;
  options: NonNullable<OxlintConfig['options']>;
  overrides: NonNullable<OxlintConfig['overrides']>;
  plugins: NonNullable<OxlintConfig['plugins']>;
  pluginKeys: Set<NonNullable<OxlintConfig['plugins']>[number]>;
  rules: NonNullable<OxlintConfig['rules']>;
  settings: NonNullable<OxlintConfig['settings']>;
}

const createCompositionAccumulators = (): CompositionAccumulators => ({
  categories: {},
  env: {},
  globals: {},
  ignorePatterns: [],
  ignorePatternKeys: new Set<string>(),
  jsPlugins: [],
  jsPluginKeys: new Set<string>(),
  options: {},
  overrides: [],
  plugins: [],
  pluginKeys: new Set(),
  rules: {},
  settings: {},
});

const mergeConfigIntoAccumulators = (acc: CompositionAccumulators, config: OxlintConfig): void => {
  Object.assign(acc.categories, config.categories);
  Object.assign(acc.env, config.env);
  Object.assign(acc.globals, config.globals);
  addUnique(acc.ignorePatterns, acc.ignorePatternKeys, config.ignorePatterns);
  addUniqueByKey(acc.jsPlugins, acc.jsPluginKeys, config.jsPlugins, jsPluginKey);
  Object.assign(acc.options, config.options);
  acc.overrides.push(...(config.overrides ?? []));
  addUnique(acc.plugins, acc.pluginKeys, config.plugins);
  Object.assign(acc.rules, config.rules);
  Object.assign(acc.settings, config.settings);
};

// Each helper returns only the fields that have content; spreading both gives the complete result.
const buildRecordFields = (acc: CompositionAccumulators): OxlintConfig => ({
  ...(isNonEmptyRecord(acc.categories) ? { categories: acc.categories } : {}),
  ...(isNonEmptyRecord(acc.env) ? { env: acc.env } : {}),
  ...(isNonEmptyRecord(acc.globals) ? { globals: acc.globals } : {}),
  ...(isNonEmptyRecord(acc.options) ? { options: acc.options } : {}),
  ...(isNonEmptyRecord(acc.rules) ? { rules: acc.rules } : {}),
  ...(isNonEmptyRecord(acc.settings) ? { settings: acc.settings } : {}),
});

const buildArrayFields = (acc: CompositionAccumulators): OxlintConfig => ({
  ...(acc.ignorePatterns.length > 0 ? { ignorePatterns: acc.ignorePatterns } : {}),
  ...(acc.jsPlugins.length > 0 ? { jsPlugins: acc.jsPlugins } : {}),
  ...(acc.overrides.length > 0 ? { overrides: acc.overrides } : {}),
  ...(acc.plugins.length > 0 ? { plugins: acc.plugins } : {}),
});

export const composeLintConfigs = (...configs: OxlintConfig[]): OxlintConfig => {
  const acc = createCompositionAccumulators();
  for (const config of configs) {
    mergeConfigIntoAccumulators(acc, config);
  }
  return { ...buildRecordFields(acc), ...buildArrayFields(acc) };
};
