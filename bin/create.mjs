#!/usr/bin/env node
/**
 * create — `npx vantage-vscode-extension-boilerplate <dir>`: a new VS Code extension project.
 *
 * Copies exactly the paths of bin/template-files.json from this package into <dir>, restores
 * `.gitignore` and `package-lock.json` (npm never ships them under their own names; prepack writes
 * them under template/), then makes the copy the new project's own:
 *   - package.json and package-lock.json: `name` = the directory's basename, version 0.1.0, no `bin`,
 *     no `files`, no boilerplate-only script (`prepack`, `test:pack`), `bin` dropped from the lint paths;
 *     everything else kept;
 *   - CHANGELOG.md: the header (named for the project) and an empty `## [Unreleased]`;
 *   - changelog.d/: its README only (the list names no fragment).
 *
 * Refusals, exit 2, naming the cause, before anything is written: an existing non-empty <dir>, a
 * basename that is not a legal npm and vsce name (lowercase letters, digits, hyphens; not starting
 * with a hyphen), or a template file this package does not carry. Usage error: exit 1.
 * Runs through npm's .bin symlink: the package root is resolved from this file's real path.
 * No dependencies: node built-ins only.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "..");
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const BOILERPLATE_ONLY_SCRIPTS = ["prepack", "test:pack"];
// Fields that carry the boilerplate's identity (its repository, home page and issue tracker). A created project is a
// different extension: its Marketplace listing and npm page must not point at the boilerplate, so these are dropped and
// the README tells the user to set their own. tests/unit/create.test.ts refuses any field still naming the boilerplate.
const IDENTITY_FIELDS = ["repository", "homepage", "bugs"];
const LINT_SCRIPTS = ["lint", "lint:fix"];
const UNRELEASED = "## [Unreleased]";

class Refusal extends Error {}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Where a generated file is read from. Two layouts, both legitimate: the packed tarball carries it
 * under template/ (written at prepack); a working tree, where prepack has not run, carries it at its
 * own path. Neither present is a refusal, never a silent skip.
 */
function generatedSource(tarballPath, projectPath) {
  for (const candidate of [join(ROOT, tarballPath), join(ROOT, projectPath)])
    if (existsSync(candidate)) return candidate;
  throw new Refusal(`this package carries neither ${tarballPath} nor ${projectPath}`);
}

function plan(arg) {
  const target = resolve(arg);
  const name = basename(target);
  if (!NAME_RE.test(name) || name.length > 214)
    throw new Refusal(
      `illegal project name ${JSON.stringify(name)}: npm and vsce need lowercase letters, digits and hyphens, not starting with a hyphen`
    );
  if (existsSync(target)) {
    if (!statSync(target).isDirectory())
      throw new Refusal(`${target} exists and is not a directory`);
    if (readdirSync(target).length > 0) throw new Refusal(`${target} exists and is not empty`);
  }
  const list = readJson(join(ROOT, "bin", "template-files.json"));
  for (const path of list.files)
    if (!existsSync(join(ROOT, path)))
      throw new Refusal(`template file ${path} missing from ${ROOT}`);
  const generated = Object.entries(list.generated).map(([tarballPath, projectPath]) => ({
    from: generatedSource(tarballPath, projectPath),
    to: projectPath,
  }));
  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  const at = changelog.indexOf(UNRELEASED);
  if (at === -1) throw new Refusal(`CHANGELOG.md has no "${UNRELEASED}" header`);
  const boilerplateName = readJson(join(ROOT, "package.json")).name;
  const freshChangelog = `${changelog.slice(0, at).replaceAll(boilerplateName, name)}${UNRELEASED}\n`;
  return { target, name, list, generated, freshChangelog };
}

function ownPackageJson(pkg, name) {
  pkg.name = name;
  pkg.version = "0.1.0";
  pkg.bin = undefined;
  pkg.files = undefined;
  for (const field of IDENTITY_FIELDS) pkg[field] = undefined;
  for (const script of BOILERPLATE_ONLY_SCRIPTS) delete pkg.scripts?.[script];
  for (const script of LINT_SCRIPTS)
    if (typeof pkg.scripts?.[script] === "string")
      pkg.scripts[script] = pkg.scripts[script]
        .split(" ")
        .filter((arg) => arg !== "bin")
        .join(" ");
  return pkg;
}

function ownLockfile(lock, name) {
  lock.name = name;
  lock.version = "0.1.0";
  const root = lock.packages?.[""];
  if (root) {
    root.name = name;
    root.version = "0.1.0";
    root.bin = undefined;
  }
  return lock;
}

function create({ target, name, list, generated, freshChangelog }) {
  mkdirSync(target, { recursive: true });
  const excluded = new Set(list.exclude.map((path) => join(ROOT, path)));
  for (const path of list.files)
    cpSync(join(ROOT, path), join(target, path), {
      recursive: true,
      filter: (src) => !excluded.has(src),
    });
  for (const { from, to } of generated) cpSync(from, join(target, to));
  writeJson(
    join(target, "package.json"),
    ownPackageJson(readJson(join(target, "package.json")), name)
  );
  const lockPath = join(target, "package-lock.json");
  if (existsSync(lockPath)) writeJson(lockPath, ownLockfile(readJson(lockPath), name));
  writeFileSync(join(target, "CHANGELOG.md"), freshChangelog);
}

export function main(argv) {
  if (argv.length !== 1) {
    console.error("usage: vantage-vscode-extension-boilerplate <dir>");
    return 1;
  }
  try {
    const p = plan(argv[0]);
    create(p);
    console.log(
      [
        `Created ${p.name} in ${p.target}`,
        "",
        "Next steps:",
        `  cd ${argv[0]}`,
        "  1. Edit extension.config.json (one file = one server: id, label, description, publisher, url, icon, views).",
        "  2. npm install",
        "  3. npm run manifest:write   # copies the derived fields into package.json and package.nls*.json",
        "  4. npm run build && npm test",
        "  5. npx @vscode/vsce package # produces the .vsix",
        "Marketplace publication is a later step; see README.md.",
      ].join("\n")
    );
    return 0;
  } catch (e) {
    if (e instanceof Refusal) {
      console.error(`vantage-vscode-extension-boilerplate: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
