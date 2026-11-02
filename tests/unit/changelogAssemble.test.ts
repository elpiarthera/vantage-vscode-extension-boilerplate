import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations
import { main } from "../../scripts/changelog-assemble.mjs";

// One changelog fragment per pull request (changelog.d/), folded into CHANGELOG.md at release (docs/releasing.md),
// so parallel pull requests stop conflicting on CHANGELOG.md's `## [Unreleased]` block.
const scratch = mkdtempSync(join(tmpdir(), "vsx-changelog-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const HEAD =
  "# Changelog\n\nIntro.\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n### Fixed\n- old\n";
function repo(fragments: Record<string, string>, changelog = HEAD): string {
  const dir = join(scratch, `r${n++}`);
  mkdirSync(join(dir, "changelog.d"), { recursive: true });
  writeFileSync(join(dir, "CHANGELOG.md"), changelog);
  writeFileSync(join(dir, "changelog.d", "README.md"), "ignored");
  for (const [name, text] of Object.entries(fragments))
    writeFileSync(join(dir, "changelog.d", name), text);
  return dir;
}
const frag = (section: string, body: string) => `---\nsection: ${section}\n---\n${body}\n`;
const quiet = <T>(f: () => T): { value: T; err: string } => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const value = f();
    return { value, err: spy.mock.calls.flat().join("\n") };
  } finally {
    spy.mockRestore();
    log.mockRestore();
  }
};

describe("changelog-assemble --check", () => {
  it("well-formed fragments and an empty [Unreleased] -> 0; this repository passes", () => {
    expect(quiet(() => main(["--check"], repo({ "a.md": frag("Fixed", "- a") }))).value).toBe(0);
    expect(quiet(() => main(["--check"], join(import.meta.dirname, ".."))).value).toBe(0);
  });

  it.each([
    ["no frontmatter", "no frontmatter"],
    ["a section outside Keep a Changelog", frag("Misc", "- x")],
    ["an empty body", frag("Fixed", "")],
  ])("MUST_BLOCK — %s -> 2, naming the file", (_form, text) => {
    const { value, err } = quiet(() => main(["--check"], repo({ "bad.md": text })));
    expect(value).toBe(2);
    expect(err).toMatch(/MALFORMED \S*changelog\.d\/bad\.md/);
  });

  it("MUST_BLOCK — an entry written under [Unreleased] -> 2, naming the line", () => {
    const changelog = HEAD.replace(
      "## [Unreleased]\n",
      "## [Unreleased]\n\n### Added\n- typed here\n"
    );
    const { value, err } = quiet(() => main(["--check"], repo({}, changelog)));
    expect(value).toBe(2);
    expect(err).toMatch(/UNRELEASED ENTRY \S*CHANGELOG\.md:8: - typed here/);
  });

  it("a section heading alone under [Unreleased] is not an entry -> 0", () => {
    const changelog = HEAD.replace("## [Unreleased]\n", "## [Unreleased]\n\n### Added\n");
    expect(quiet(() => main(["--check"], repo({}, changelog))).value).toBe(0);
  });
});

describe("changelog-assemble --version", () => {
  it("folds fragments as `## [x.y.z] - date` below [Unreleased], in Keep a Changelog order, then deletes them", () => {
    const dir = repo({
      "b.md": frag("Fixed", "- fixed b"),
      "a.md": frag("Added", "- added a"),
      "c.md": frag("Removed", "- removed c"),
      "d.md": frag("Security", "- security d"),
    });
    expect(quiet(() => main(["--version", "0.2.0", "--date", "2026-11-02"], dir)).value).toBe(0);
    const out = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(out).toContain(
      "## [Unreleased]\n\n## [0.2.0] - 2026-11-02\n\n### Added\n- added a\n\n### Removed\n- removed c\n\n### Fixed\n- fixed b\n\n### Security\n- security d\n\n## [0.1.0] - 2026-01-01"
    );
    expect(readdirSync(join(dir, "changelog.d"))).toEqual(["README.md"]);
  });

  it("no fragment -> CHANGELOG.md untouched", () => {
    const dir = repo({});
    expect(quiet(() => main(["--version", "0.2.0"], dir)).value).toBe(0);
    expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe(HEAD);
  });
});

// The task's acceptance (k17afbzykg1nbfwwc0pm8hy2818he2yk): two branches editing [Unreleased] conflict; the same two
// changes as fragments merge in either order. Asserted with git itself (merge-tree), in a throwaway repository.
describe("parallel pull requests", () => {
  const git = (dir: string, ...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      encoding: "utf8",
    });
  function pair(edit: (dir: string, who: string) => void): { clean: boolean } {
    const dir = join(scratch, `g${n++}`);
    mkdirSync(join(dir, "changelog.d"), { recursive: true });
    writeFileSync(join(dir, "CHANGELOG.md"), HEAD);
    writeFileSync(join(dir, "changelog.d", "README.md"), "ignored");
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "base");
    for (const who of ["one", "two"]) {
      git(dir, "switch", "-qc", who, "main");
      edit(dir, who);
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", who);
    }
    try {
      git(dir, "merge-tree", "--write-tree", "one", "two");
      return { clean: true };
    } catch {
      return { clean: false };
    }
  }

  it("RED pole: two branches each adding an entry under [Unreleased] -> merge-tree reports a conflict", () => {
    const r = pair((dir, who) =>
      writeFileSync(
        join(dir, "CHANGELOG.md"),
        HEAD.replace("## [Unreleased]\n", `## [Unreleased]\n\n### Added\n- ${who}\n`)
      )
    );
    expect(r.clean).toBe(false);
  });

  it("the same two changes as fragments -> merge-tree clean", () => {
    const r = pair((dir, who) =>
      writeFileSync(join(dir, "changelog.d", `${who}.md`), frag("Added", `- ${who}`))
    );
    expect(r.clean).toBe(true);
  });
});
