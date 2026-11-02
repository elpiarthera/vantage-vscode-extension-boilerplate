import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations
import { renderNpmignore } from "../../bin/template-prepare.mjs";

// `npx vantage-vscode-extension-boilerplate <dir>` (bin/create.mjs), run from the working tree as a child process.
// The end-to-end proof from the packed tarball (install, build, test, lint, .vsix) is `npm run test:pack`.
const ROOT = join(import.meta.dirname, "..", "..");
const BIN = join(ROOT, "bin", "create.mjs");
const LIST = JSON.parse(readFileSync(join(ROOT, "bin", "template-files.json"), "utf8")) as {
  files: string[];
  exclude: string[];
  generated: Record<string, string>;
};
const BOILERPLATE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "vsx-create-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function create(target: string, bin = BIN) {
  const r = spawnSync(process.execPath, [bin, target], { encoding: "utf8", cwd: scratch });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

describe("create <dir>", () => {
  const target = join(scratch, "my-ext");
  const first = create(target);

  it("exits 0 and prints the next steps", () => {
    expect(first.err).toBe("");
    expect(first.code).toBe(0);
    for (const step of [
      "extension.config.json",
      "npm run manifest:write",
      "npm install",
      "npm run build",
    ])
      expect(first.out).toContain(step);
    expect(first.out).toContain("@vscode/vsce package");
  });

  it("copies every path of bin/template-files.json, and nothing boilerplate-only", () => {
    for (const path of LIST.files) expect(existsSync(join(target, path)), path).toBe(true);
    for (const path of [...LIST.exclude, "bin", "template", "node_modules", "out", "tests/pack"])
      expect(existsSync(join(target, path)), path).toBe(false);
  });

  it("restores .gitignore and package-lock.json under their own names", () => {
    expect(readFileSync(join(target, ".gitignore"), "utf8")).toBe(
      readFileSync(join(ROOT, ".gitignore"), "utf8")
    );
    const lock = json(join(target, "package-lock.json"));
    expect(lock.name).toBe("my-ext");
    expect(lock.packages[""].name).toBe("my-ext");
    expect(lock.packages[""].bin).toBeUndefined();
    expect(lock.packages[""].devDependencies).toEqual(BOILERPLATE.devDependencies);
  });

  it("package.json: name = the directory, version 0.1.0, no bin/files/boilerplate-only script, the rest kept", () => {
    const pkg = json(join(target, "package.json"));
    expect(pkg.name).toBe("my-ext");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.bin).toBeUndefined();
    expect(pkg.files).toBeUndefined();
    expect(pkg.scripts.prepack).toBeUndefined();
    expect(pkg.scripts["test:pack"]).toBeUndefined();
    expect(pkg.scripts.lint).toBe(BOILERPLATE.scripts.lint.replace(/ bin\b/, ""));
    expect(pkg.scripts["lint:fix"]).toBe(BOILERPLATE.scripts["lint:fix"].replace(/ bin\b/, ""));
    for (const key of ["publisher", "displayName", "description", "contributes", "devDependencies"])
      expect(pkg[key], key).toEqual(BOILERPLATE[key]);
    expect(pkg.scripts.build).toBe(BOILERPLATE.scripts.build);
  });

  it("CHANGELOG.md: the header, named for the project, and an empty [Unreleased], no released section", () => {
    const text = readFileSync(join(target, "CHANGELOG.md"), "utf8");
    const header = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8").split("## [Unreleased]")[0];
    expect(text).toBe(
      `${header.replaceAll("vantage-vscode-extension-boilerplate", "my-ext")}## [Unreleased]\n`
    );
    expect(text).not.toMatch(/^## \[\d/m);
  });

  it("changelog.d holds its README only, whatever fragments the boilerplate carries", () => {
    // A fixture package root with an own fragment, so the assertion bites whatever the working tree holds.
    const pkgRoot = join(scratch, "fixture-pkg");
    for (const path of [...LIST.files, "bin", ".gitignore", "package-lock.json"])
      cpSync(join(ROOT, path), join(pkgRoot, path), { recursive: true });
    writeFileSync(
      join(pkgRoot, "changelog.d", "own-fragment.md"),
      "---\nsection: Added\n---\n- own\n"
    );
    const dest = join(scratch, "from-fixture");
    expect(create(dest, join(pkgRoot, "bin", "create.mjs")).code).toBe(0);
    expect(readdirSync(join(dest, "changelog.d"))).toEqual(["README.md"]);
  });

  it("works through a symlink, as npx runs it from node_modules/.bin", () => {
    const link = join(scratch, ".bin", "vantage-vscode-extension-boilerplate");
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(BIN, link);
    const dest = join(scratch, "via-link");
    expect(create(dest, link).code).toBe(0);
    expect(json(join(dest, "package.json")).name).toBe("via-link");
  });

  it("accepts an existing empty directory", () => {
    const dest = join(scratch, "empty-dir");
    mkdirSync(dest);
    expect(create(dest).code).toBe(0);
  });
});

describe("refusals (exit 2, naming the cause, nothing written)", () => {
  it("MUST_BLOCK — an existing non-empty directory", () => {
    const dest = join(scratch, "taken");
    mkdirSync(dest);
    writeFileSync(join(dest, "keep.txt"), "mine");
    const r = create(dest);
    expect(r.code).toBe(2);
    expect(r.err).toContain(dest);
    expect(r.err).toMatch(/not empty/);
    expect(readdirSync(dest)).toEqual(["keep.txt"]);
  });

  it.each(["My-Ext", "my_ext", "my.ext", "-ext"])("MUST_BLOCK — illegal name %s", (name) => {
    const dest = join(scratch, name);
    const r = create(dest);
    expect(r.code).toBe(2);
    expect(r.err).toContain(JSON.stringify(name));
    expect(existsSync(dest)).toBe(false);
  });

  it("no argument -> exit 1, usage", () => {
    const r = spawnSync(process.execPath, [BIN], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/usage/i);
  });
});

describe("the npm tarball allowlist", () => {
  it(".npmignore is the rendering of bin/template-files.json (run `node bin/template-prepare.mjs --npmignore`)", () => {
    expect(readFileSync(join(ROOT, ".npmignore"), "utf8")).toBe(renderNpmignore(LIST));
  });

  it("every listed path exists in the working tree", () => {
    for (const path of [...LIST.files, ...LIST.exclude, ...Object.values(LIST.generated)])
      expect(existsSync(join(ROOT, path)), path).toBe(true);
  });
});
