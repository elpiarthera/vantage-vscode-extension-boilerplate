#!/usr/bin/env node
/**
 * pack-e2e — `npm run test:pack`: the end-to-end proof that bin/template-files.json is complete.
 *
 * Packs this repository exactly as `npm publish` would (prepack included), then, as a consumer in a
 * fresh temporary directory: `npx --package <tarball> vantage-vscode-extension-boilerplate e2e-ext`
 * (through npm's own .bin symlink), and in the new project `npm ci`, `npm run build`, `npm test`,
 * `npm run lint`, `npm run typecheck`, `npx @vscode/vsce package --no-dependencies`. A `.vsix` must
 * exist at the end. Any step failing fails the run, naming the step; its output is printed.
 *
 * Slow (network installs) and therefore outside `npm test`. Everything happens under one mkdtemp
 * directory, removed on success and kept (path printed) on failure. Nothing is read from the
 * environment but `npm`, `npx`, `tar` on PATH; the repository root comes from this file's location.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "..", "..");
const VSCE = "@vscode/vsce@3";
const work = mkdtempSync(join(tmpdir(), "vsx-pack-e2e-"));

function step(label, cmd, args, cwd, summary) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`FAIL ${label} (exit ${r.status}, ${secs}s): ${cmd} ${args.join(" ")}`);
    console.error(r.stdout, r.stderr, r.error ?? "");
    console.error(`kept for inspection: ${work}`);
    process.exit(1);
  }
  const line = summary ? (`${r.stdout}\n${r.stderr}`.match(summary)?.[0] ?? "") : "";
  console.log(`ok   ${label} (${secs}s)${line ? ` — ${line.trim()}` : ""}`);
  return r.stdout;
}

const packDir = join(work, "pack");
mkdirSync(packDir);
step("npm pack", "npm", ["pack", "--pack-destination", packDir], ROOT);
const tarballs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
if (tarballs.length !== 1) {
  console.error(
    `FAIL npm pack: expected one tarball in ${packDir}, found ${JSON.stringify(tarballs)}`
  );
  process.exit(1);
}
const tarball = join(packDir, tarballs[0]);
console.log(`     ${tarballs[0]} ${statSync(tarball).size} bytes`);

const consumer = join(work, "consumer");
mkdirSync(consumer);
step(
  "npx vantage-vscode-extension-boilerplate e2e-ext",
  "npx",
  ["--yes", "--package", tarball, "vantage-vscode-extension-boilerplate", "e2e-ext"],
  consumer
);
const project = join(consumer, "e2e-ext");
// The created project is a different extension: none of its package.json fields may name the boilerplate.
{
  const own = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;
  const created = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  const naming = Object.entries(created)
    .filter(([, v]) => JSON.stringify(v).includes(own))
    .map(([k]) => k);
  if (naming.length > 0) {
    console.error(`FAIL created package.json still names the boilerplate in: ${naming.join(", ")}`);
    process.exit(1);
  }
  console.log("ok   created package.json names nothing of the boilerplate");
  // No --repository flag: the machine marker (a placeholder the doctor reads as "not set yet"). vsce package below
  // must still succeed with it.
  const { REPOSITORY_TODO_MARKER: marker } = await import(join(ROOT, "bin", "create.mjs"));
  if (created.repository?.url !== marker) {
    console.error(
      `FAIL created repository is ${JSON.stringify(created.repository)}, expected the marker ${marker}`
    );
    process.exit(1);
  }
  console.log("ok   created package.json carries the repository TODO marker (no flag)");
}
step("npm ci", "npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], project);
step("npm run build", "npm", ["run", "build"], project);
step("npm test", "npm", ["test"], project, /Tests\s+\d+ passed[^\n]*/);
step("npm run lint", "npm", ["run", "lint"], project);
step("npm run typecheck", "npm", ["run", "typecheck"], project);
const shipped = step(`npx ${VSCE} ls`, "npx", ["--yes", VSCE, "ls", "--no-dependencies"], project)
  .split("\n")
  .filter(Boolean);
const leaked = shipped.filter(
  (f) => !/^(out\/|media\/|l10n\/|package|extension\.config\.json|README|LICENSE|CHANGELOG)/.test(f)
);
if (leaked.length > 0) {
  console.error(`FAIL vsce ls: the .vsix would ship ${JSON.stringify(leaked)}`);
  console.error(`kept for inspection: ${work}`);
  process.exit(1);
}
console.log(`     .vsix allowlist: ${shipped.length} files, none outside the runtime set`);
const out = join(work, "vsix");
mkdirSync(out);
step(
  `npx ${VSCE} package`,
  "npx",
  ["--yes", VSCE, "package", "--no-dependencies", "--out", out],
  project
);
const vsix = readdirSync(out).filter((f) => f.endsWith(".vsix"));
if (vsix.length !== 1) {
  console.error(`FAIL vsce package: expected one .vsix in ${out}, found ${JSON.stringify(vsix)}`);
  console.error(`kept for inspection: ${work}`);
  process.exit(1);
}
console.log(`     ${vsix[0]} ${statSync(join(out, vsix[0])).size} bytes`);
console.log("pack-e2e: PASS");
rmSync(work, { recursive: true, force: true });
