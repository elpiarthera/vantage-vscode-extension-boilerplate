#!/usr/bin/env node
/**
 * manifest-sync — package.json fields derived from extension.config.json.
 *
 * VS Code reads package.json statically (the contributed MCP provider, the panel's view container
 * and webview views, the activation events, the publisher, the icon), so those fields must exist
 * there as literals, and the view titles must exist in package.nls.json (EN) and package.nls.fr.json
 * (FR). They are a DERIVED copy of extension.config.json, never typed twice: `--check` (run by
 * `npm run build`) refuses any difference, naming the field or the nls key; without `--check` the
 * fields and keys are rewritten from the config.
 *
 * The configuration is validated by the extension's own compiled loader (out/config.js), so the
 * build and the runtime refuse exactly the same files.
 *
 * Usage:
 *   node scripts/manifest-sync.mjs --check   exit 0 if package.json agrees, 2 naming each field
 *   node scripts/manifest-sync.mjs           rewrite the derived fields of package.json and the nls files
 * Run from the extension root (reads ./package.json, ./package.nls*.json and ./extension.config.json).
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const LOADER = join(fileURLToPath(new URL("..", import.meta.url)), "out", "config.js");

/** The compiled loader's helpers (one derivation of ids and keys, shared with the runtime). */
function helpers() {
  if (!existsSync(LOADER)) throw new Error(`${LOADER} not found — run tsc first (npm run build)`);
  return require(LOADER);
}

/** The fields package.json must carry, as functions of the configuration. */
export function derivedFields(config) {
  const {
    panelContainerId,
    viewTitleNlsKey,
    PANEL_TITLE_NLS_KEY,
    DISPLAY_NAME_NLS_KEY,
    DESCRIPTION_NLS_KEY,
  } = helpers();
  const views = config.views ?? [];
  const container = panelContainerId(config);
  return {
    publisher: config.publisher,
    displayName: `%${DISPLAY_NAME_NLS_KEY}%`,
    description: `%${DESCRIPTION_NLS_KEY}%`,
    icon: config.icon,
    activationEvents: [`onMcpCollection:${config.id}`, ...views.map((v) => `onView:${v.id}`)],
    l10n: "./l10n",
    "contributes.mcpServerDefinitionProviders": [{ id: config.id, label: config.label }],
    "contributes.viewsContainers":
      views.length === 0
        ? undefined
        : {
            activitybar: [{ id: container, title: `%${PANEL_TITLE_NLS_KEY}%`, icon: config.icon }],
          },
    "contributes.views":
      views.length === 0
        ? undefined
        : {
            [container]: views.map((v) => ({
              type: "webview",
              id: v.id,
              name: `%${viewTitleNlsKey(v.id)}%`,
            })),
          },
  };
}

/**
 * The nls keys this script owns, per language: the extension's display name (the server name, a proper
 * noun, identical in both languages) and description (translated in the config), the container title
 * (the server name again) and each view title in its language. Keys it does not own
 * are left alone; an owned-pattern key (`panel.view.*.title`) with no configured view is stale.
 */
export function derivedNls(config) {
  const {
    viewTitleNlsKey,
    PANEL_TITLE_NLS_KEY,
    LANGUAGES,
    DISPLAY_NAME_NLS_KEY,
    DESCRIPTION_NLS_KEY,
  } = helpers();
  const views = config.views ?? [];
  const out = {};
  for (const lang of LANGUAGES) {
    out[lang] = {
      // The name is a proper noun (the same in both files); the description is translated in the config.
      [DISPLAY_NAME_NLS_KEY]: config.label,
      [DESCRIPTION_NLS_KEY]: config.description[lang],
    };
    if (views.length > 0) out[lang][PANEL_TITLE_NLS_KEY] = config.label;
    for (const v of views) out[lang][viewTitleNlsKey(v.id)] = v.title[lang];
  }
  return out;
}

const NLS_FILE = (lang) => (lang === "en" ? "package.nls.json" : `package.nls.${lang}.json`);
const OWNED = (key) => helpers().isOwnedNlsKey(key);

/** Every owned nls key whose value differs from the configuration, or that no view owns. */
export function nlsMismatches(nls, config) {
  const out = [];
  for (const [lang, expected] of Object.entries(derivedNls(config))) {
    const actual = nls[lang] ?? {};
    for (const [key, value] of Object.entries(expected))
      if (actual[key] !== value)
        out.push({ file: NLS_FILE(lang), key, expected: value, actual: actual[key] });
    for (const key of Object.keys(actual))
      if (OWNED(key) && !(key in expected))
        out.push({ file: NLS_FILE(lang), key, expected: undefined, actual: actual[key] });
  }
  return out;
}

function read(pkg, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), pkg);
}

function write(pkg, path, value) {
  const keys = path.split(".");
  let o = pkg;
  for (const k of keys.slice(0, -1)) {
    if (typeof o[k] !== "object" || o[k] === null) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/** Every derived field whose package.json value differs from the configuration. */
export function manifestMismatches(pkg, config) {
  const out = [];
  for (const [field, expected] of Object.entries(derivedFields(config))) {
    const actual = read(pkg, field);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) out.push({ field, expected, actual });
  }
  return out;
}

export function main(argv, cwd = process.cwd()) {
  const check = argv.includes("--check");
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length > 0) {
    console.error(`manifest-sync: unknown argument ${unknown[0]}`);
    return 1;
  }
  let config;
  try {
    config = helpers().loadConfig(join(cwd, "extension.config.json"));
  } catch (e) {
    console.error(`manifest-sync: ${e.message}`);
    return e instanceof Error && /not found — run tsc/.test(e.message) ? 1 : 2;
  }
  const pkgPath = join(cwd, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const mismatches = manifestMismatches(pkg, config);
  const nls = {};
  for (const lang of Object.keys(derivedNls(config))) {
    const f = join(cwd, NLS_FILE(lang));
    nls[lang] = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  }
  const nlsDrift = nlsMismatches(nls, config);
  if (check) {
    for (const m of mismatches)
      console.error(
        `MISMATCH package.json ${m.field}: ${JSON.stringify(m.actual)} — extension.config.json gives ${JSON.stringify(m.expected)} (run npm run manifest:write)`
      );
    for (const m of nlsDrift)
      console.error(
        `MISMATCH ${m.file} ${m.key}: ${JSON.stringify(m.actual)} — extension.config.json gives ${JSON.stringify(m.expected)} (run npm run manifest:write)`
      );
    if (mismatches.length + nlsDrift.length > 0) return 2;
    console.log(
      "manifest-sync --check: package.json and package.nls*.json agree with extension.config.json"
    );
    return 0;
  }
  for (const m of mismatches) write(pkg, m.field, m.expected);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const expectedNls = derivedNls(config);
  for (const lang of Object.keys(expectedNls)) {
    const table = nls[lang];
    for (const key of Object.keys(table))
      if (OWNED(key) && !(key in expectedNls[lang])) delete table[key];
    Object.assign(table, expectedNls[lang]);
    writeFileSync(join(cwd, NLS_FILE(lang)), `${JSON.stringify(table, null, 2)}\n`);
  }
  console.log(
    `manifest-sync: ${mismatches.length} field(s) and ${nlsDrift.length} nls key(s) written from extension.config.json`
  );
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
