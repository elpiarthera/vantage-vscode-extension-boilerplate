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
 *   - changelog.d/: its README only (the list names no fragment);
 *   - `repository`: the NEW project's, from `--repository <url>`; without the flag the machine marker
 *     REPOSITORY_TODO_MARKER (vscode-extension-doctor's V-9 reads it as "not set yet": could-not-judge, never a pass).
 *     `homepage` and `bugs` are dropped. The boilerplate's own repository is never written.
 *
 * Refusals, exit 2, naming the cause, before anything is written: an existing non-empty <dir>, a
 * basename that is not a legal npm and vsce name (lowercase letters, digits, hyphens; not starting
 * with a hyphen), a template file this package does not carry, an unknown flag, and a `--repository` value that is
 * not an https:/git+https:/git+ssh:/ssh: URL or that names the boilerplate. Usage error (not exactly one <dir>): exit 1.
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
/**
 * What `repository.url` holds when the user gave no `--repository`: a machine marker, not prose.
 * vscode-extension-doctor carries the same string (src/detectors/v9.ts) and reports V-9 could-not-judge on it.
 */
export const REPOSITORY_TODO_MARKER = "urn:vantage:todo:repository";
const REPOSITORY_PROTOCOLS = ["https:", "git+https:", "git+ssh:", "ssh:"];
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

/** Split argv into the one <dir> and the options; any other flag is a refusal. */
function parseArgv(argv) {
  const positional = [];
  let repository;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repository" || a.startsWith("--repository=")) {
      repository = a === "--repository" ? argv[++i] : a.slice("--repository=".length);
      if (repository === undefined)
        throw new Refusal("--repository needs a value: --repository <url>");
    } else if (a.startsWith("-")) throw new Refusal(`unknown option ${a}`);
    else positional.push(a);
  }
  return { positional, repository };
}

/** The repository URL a project may carry: well-formed, an allowed scheme, never the boilerplate's. */
function checkRepository(url, boilerplateName) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Refusal(
      `--repository ${JSON.stringify(url)} is not a URL (use https://, git+https://, git+ssh:// or ssh://)`
    );
  }
  if (!REPOSITORY_PROTOCOLS.includes(parsed.protocol))
    throw new Refusal(
      `--repository ${JSON.stringify(url)}: scheme ${parsed.protocol} is not allowed (${REPOSITORY_PROTOCOLS.join(", ")})`
    );
  if (url.toLowerCase().includes(boilerplateName.toLowerCase()))
    throw new Refusal(
      `--repository ${JSON.stringify(url)} names the boilerplate itself; give YOUR project's repository`
    );
  return url;
}

function plan(arg, repositoryUrl) {
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
  const repository = {
    type: "git",
    url:
      repositoryUrl === undefined
        ? REPOSITORY_TODO_MARKER
        : checkRepository(repositoryUrl, boilerplateName),
  };
  const freshChangelog = `${changelog.slice(0, at).replaceAll(boilerplateName, name)}${UNRELEASED}\n`;
  return { target, name, list, generated, freshChangelog, repository };
}

function ownPackageJson(pkg, name, repository) {
  pkg.name = name;
  pkg.version = "0.1.0";
  pkg.bin = undefined;
  pkg.files = undefined;
  for (const field of IDENTITY_FIELDS) pkg[field] = undefined;
  pkg.repository = repository;
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

function create({ target, name, list, generated, freshChangelog, repository }) {
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
    ownPackageJson(readJson(join(target, "package.json")), name, repository)
  );
  const lockPath = join(target, "package-lock.json");
  if (existsSync(lockPath)) writeJson(lockPath, ownLockfile(readJson(lockPath), name));
  writeFileSync(join(target, "CHANGELOG.md"), freshChangelog);
}

export function main(argv) {
  try {
    const { positional, repository } = parseArgv(argv);
    if (positional.length !== 1) {
      console.error("usage: vantage-vscode-extension-boilerplate <dir> [--repository <url>]");
      return 1;
    }
    const p = plan(positional[0], repository);
    create(p);
    console.log(
      [
        `Created ${p.name} in ${p.target}`,
        "",
        "Next steps:",
        `  cd ${positional[0]}`,
        "  1. Edit extension.config.json (one file = one server: id, label, description, publisher, url, icon, views).",
        "  2. npm install",
        "  3. npm run manifest:write   # copies the derived fields into package.json and package.nls*.json",
        "  4. npm run build && npm test",
        "  5. npx @vscode/vsce package # produces the .vsix",
        "Marketplace publication is a later step; see README.md.",
        ...(repository === undefined
          ? [
              "",
              `Set your repository: package.json "repository" holds the placeholder ${REPOSITORY_TODO_MARKER}. Re-run with --repository <url>, or replace it with your project's repository URL before publishing.`,
            ]
          : []),
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
