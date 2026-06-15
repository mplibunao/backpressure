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
  target: Array<Item>,
  seen: Set<Item>,
  values: ReadonlyArray<Item> | undefined,
): void => {
  if (typeof values === 'undefined') {
    return;
  }

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    target.push(value);
  }
};

const addUniqueByKey = <Item>(
  target: Array<Item>,
  seen: Set<string>,
  values: ReadonlyArray<Item> | undefined | null,
  keyFor: (value: Item) => string,
): void => {
  if (typeof values === 'undefined' || values === null) {
    return;
  }

  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    target.push(value);
  }
};

export const composeLintConfigs = (...configs: Array<OxlintConfig>): OxlintConfig => {
  const categories: NonNullable<OxlintConfig['categories']> = {};
  const env: NonNullable<OxlintConfig['env']> = {};
  const globals: NonNullable<OxlintConfig['globals']> = {};
  const ignorePatterns: NonNullable<OxlintConfig['ignorePatterns']> = [];
  const ignorePatternKeys = new Set<string>();
  const jsPlugins: NonNullable<OxlintConfig['jsPlugins']> = [];
  const jsPluginKeys = new Set<string>();
  const options: NonNullable<OxlintConfig['options']> = {};
  const overrides: NonNullable<OxlintConfig['overrides']> = [];
  const plugins: NonNullable<OxlintConfig['plugins']> = [];
  const pluginKeys = new Set<NonNullable<OxlintConfig['plugins']>[number]>();
  const rules: NonNullable<OxlintConfig['rules']> = {};
  const settings: NonNullable<OxlintConfig['settings']> = {};

  for (const config of configs) {
    Object.assign(categories, config.categories);
    Object.assign(env, config.env);
    Object.assign(globals, config.globals);
    addUnique(ignorePatterns, ignorePatternKeys, config.ignorePatterns);
    addUniqueByKey(jsPlugins, jsPluginKeys, config.jsPlugins, jsPluginKey);
    Object.assign(options, config.options);
    overrides.push(...(config.overrides ?? []));
    addUnique(plugins, pluginKeys, config.plugins);
    Object.assign(rules, config.rules);
    Object.assign(settings, config.settings);
  }

  const result: OxlintConfig = {};
  if (isNonEmptyRecord(categories)) {
    result.categories = categories;
  }
  if (isNonEmptyRecord(env)) {
    result.env = env;
  }
  if (isNonEmptyRecord(globals)) {
    result.globals = globals;
  }
  if (ignorePatterns.length > 0) {
    result.ignorePatterns = ignorePatterns;
  }
  if (jsPlugins.length > 0) {
    result.jsPlugins = jsPlugins;
  }
  if (isNonEmptyRecord(options)) {
    result.options = options;
  }
  if (overrides.length > 0) {
    result.overrides = overrides;
  }
  if (plugins.length > 0) {
    result.plugins = plugins;
  }
  if (isNonEmptyRecord(rules)) {
    result.rules = rules;
  }
  if (isNonEmptyRecord(settings)) {
    result.settings = settings;
  }

  return result;
};
