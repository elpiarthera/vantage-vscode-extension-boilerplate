#!/usr/bin/env node
/**
 * manifest-sync — package.json fields derived from extension.config.json.
 *
 * VS Code reads package.json statically (the contributed MCP provider, the activation event,
 * the publisher, the icon), so those fields must exist there as literals. They are a DERIVED
 * copy of extension.config.json, never typed twice: `--check` (run by `npm run build`) refuses
 * any difference, naming the field; without `--check` the fields are rewritten from the config.
 *
 * The configuration is validated by the extension's own compiled loader (out/config.js), so the
 * build and the runtime refuse exactly the same files.
 *
 * Usage:
 *   node scripts/manifest-sync.mjs --check   exit 0 if package.json agrees, 2 naming each field
 *   node scripts/manifest-sync.mjs           rewrite the derived fields of package.json
 * Run from the extension root (reads ./package.json and ./extension.config.json).
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** The fields package.json must carry, as functions of the configuration. */
export function derivedFields(config) {
  return {
    publisher: config.publisher,
    displayName: config.label,
    icon: config.icon,
    activationEvents: [`onMcpCollection:${config.id}`],
    "contributes.mcpServerDefinitionProviders": [{ id: config.id, label: config.label }],
  };
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
  const loader = join(fileURLToPath(new URL("..", import.meta.url)), "out", "config.js");
  if (!existsSync(loader)) {
    console.error(`manifest-sync: ${loader} not found — run tsc first (npm run build)`);
    return 1;
  }
  const { loadConfig } = require(loader);
  let config;
  try {
    config = loadConfig(join(cwd, "extension.config.json"));
  } catch (e) {
    console.error(`manifest-sync: ${e.message}`);
    return 2;
  }
  const pkgPath = join(cwd, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const mismatches = manifestMismatches(pkg, config);
  if (check) {
    for (const m of mismatches)
      console.error(
        `MISMATCH package.json ${m.field}: ${JSON.stringify(m.actual)} — extension.config.json gives ${JSON.stringify(m.expected)} (run npm run manifest:write)`
      );
    if (mismatches.length > 0) return 2;
    console.log("manifest-sync --check: package.json agrees with extension.config.json");
    return 0;
  }
  for (const m of mismatches) write(pkg, m.field, m.expected);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`manifest-sync: ${mismatches.length} field(s) written from extension.config.json`);
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
