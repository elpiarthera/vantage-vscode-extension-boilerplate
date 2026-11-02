#!/usr/bin/env node
/**
 * template-prepare — the npm tarball side of `npx vantage-vscode-extension-boilerplate <dir>`.
 *
 * bin/template-files.json is the ONE list of what a new project receives. This script derives the
 * two things npm needs from it:
 *   - `.npmignore`, the tarball allowlist (rendered from the list, committed, and refused by the unit
 *     tests and by prepack when it differs). npm's `files` field is NOT used: vsce refuses a package.json
 *     `files` next to a `.vscodeignore`, and `.vscodeignore` is the .vsix allowlist (V-8). The two
 *     allowlists stay independent: one says what a NEW PROJECT gets, the other what the EXTENSION ships.
 *   - `template/`, written at prepack: the files npm never ships under their own names (`.gitignore`,
 *     `package-lock.json`), copied to the tarball paths bin/create.mjs restores them from.
 *
 * Usage:
 *   node bin/template-prepare.mjs              (prepack) refuse a stale .npmignore, then write template/
 *   node bin/template-prepare.mjs --npmignore  rewrite .npmignore from bin/template-files.json
 * Exit codes: 0 ok, 1 usage error, 2 stale .npmignore or a listed file missing (named).
 * No dependencies: node built-ins only.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "..");

export function readList(root = ROOT) {
  return JSON.parse(readFileSync(join(root, "bin", "template-files.json"), "utf8"));
}

/** The .npmignore that admits exactly bin/, template/ and the listed paths, minus `exclude`. */
export function renderNpmignore(list) {
  const lines = [
    "# GENERATED from bin/template-files.json by `node bin/template-prepare.mjs --npmignore`; never edit.",
    "# The npm tarball allowlist: exclude everything, then admit bin/, template/ and the template files.",
    "/*",
    "!/bin/",
    "!/template/",
  ];
  const opened = new Set();
  for (const path of list.files) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (opened.has(dir)) continue;
      opened.add(dir);
      lines.push(`!/${dir}/`, `/${dir}/*`);
    }
    lines.push(`!/${path}`);
  }
  for (const path of list.exclude) lines.push(`/${path}`);
  return `${lines.join("\n")}\n`;
}

export function main(argv, root = ROOT) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--npmignore")) {
    console.error("usage: template-prepare.mjs [--npmignore]");
    return 1;
  }
  const list = readList(root);
  const expected = renderNpmignore(list);
  const npmignore = join(root, ".npmignore");
  if (argv[0] === "--npmignore") {
    writeFileSync(npmignore, expected);
    console.log("template-prepare: .npmignore rewritten from bin/template-files.json");
    return 0;
  }
  if (!existsSync(npmignore) || readFileSync(npmignore, "utf8") !== expected) {
    console.error(
      "template-prepare: .npmignore differs from bin/template-files.json — run `node bin/template-prepare.mjs --npmignore`"
    );
    return 2;
  }
  for (const [tarballPath, source] of Object.entries(list.generated)) {
    const from = join(root, source);
    if (!existsSync(from)) {
      console.error(`template-prepare: ${source} not found (needed for ${tarballPath})`);
      return 2;
    }
    mkdirSync(dirname(join(root, tarballPath)), { recursive: true });
    copyFileSync(from, join(root, tarballPath));
  }
  console.log(`template-prepare: wrote ${Object.keys(list.generated).join(", ")}`);
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
