import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations
import { derivedFields, manifestMismatches, nlsMismatches } from "../../scripts/manifest-sync.mjs";
import { panelContainerId, viewTitleNlsKey } from "../../src/config";
import { CONFIG_PATH, ROOT, configViews, readConfigJson } from "./helpers";

// V-1 both ways: the provider id package.json contributes is the id the extension registers,
// because both come from extension.config.json. package.json carries a derived copy (VS Code
// reads the manifest statically); `npm run build` refuses any difference.
const pkg = () => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("package.json derived from extension.config.json", () => {
  it("contributes exactly one MCP provider whose id equals the configured id", () => {
    const config = readConfigJson();
    const providers = pkg().contributes.mcpServerDefinitionProviders;
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe(config.id);
    expect(providers[0].label).toBe(config.label);
  });

  it("names a vscode engine and activates only on its own MCP collection and its own views (V-12)", () => {
    const config = readConfigJson();
    expect(pkg().engines.vscode).toMatch(/^\^1\.\d+\.\d+$/);
    expect(pkg().activationEvents).toEqual([
      `onMcpCollection:${config.id}`,
      ...configViews().map((v) => `onView:${v.id}`),
    ]);
  });

  it("contributes one activity-bar container and one webview view per configured view, titles through nls", () => {
    const config = readConfigJson() as Parameters<typeof panelContainerId>[0];
    const container = panelContainerId(config);
    expect(pkg().contributes.viewsContainers.activitybar).toEqual([
      { id: container, title: "%panel.title%", icon: config.icon },
    ]);
    expect(pkg().contributes.views[container]).toEqual(
      configViews().map((v) => ({ type: "webview", id: v.id, name: `%${viewTitleNlsKey(v.id)}%` }))
    );
  });

  it("package.nls(.fr).json carry each view title in its language", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "package.nls.json"), "utf8"));
    const fr = JSON.parse(readFileSync(join(ROOT, "package.nls.fr.json"), "utf8"));
    for (const v of configViews()) {
      expect(en[viewTitleNlsKey(v.id)]).toBe(v.title.en);
      expect(fr[viewTitleNlsKey(v.id)]).toBe(v.title.fr);
    }
    expect(nlsMismatches({ en, fr }, readConfigJson())).toEqual([]);
  });

  it("every derived field matches the configuration", () => {
    expect(manifestMismatches(pkg(), readConfigJson())).toEqual([]);
  });

  // Domain of derived fields: derivedFields() is the list; each one, mutated, is refused by name.
  it.each(Object.keys(derivedFields(readConfigJson())))(
    "a package.json whose %s differs from the configuration is refused, naming the field",
    (field) => {
      const mutated = pkg();
      const keys = field.split(".");
      const parent = keys
        .slice(0, -1)
        .reduce((o: Record<string, unknown>, k) => o[k] as Record<string, unknown>, mutated);
      parent[keys[keys.length - 1]] = "mutated";
      const found = manifestMismatches(mutated, readConfigJson());
      expect(found.map((m: { field: string }) => m.field)).toEqual([field]);
    }
  );

  it("the build check exits non-zero on a temp copy whose contributed id was changed", () => {
    const mutated = pkg();
    mutated.contributes.mcpServerDefinitionProviders[0].id = "someone-else";
    const dir = tempCopy({ "package.json": mutated });
    // landing asserted before reading the verdict
    expect(readFileSync(join(dir, "package.json"), "utf8")).toContain('"someone-else"');
    const { status, stderr } = check(dir);
    expect(status).toBe(2);
    expect(stderr).toContain("contributes.mcpServerDefinitionProviders");
  });

  it("the build check passes on an untouched temp copy (positive control the other way)", () => {
    expect(check(tempCopy({})).status).toBe(0);
  });

  it("MUST_BLOCK — a view removed from package.json only -> the build check exits 2, naming contributes.views", () => {
    const mutated = pkg();
    const container = Object.keys(mutated.contributes.views)[0];
    const dropped = mutated.contributes.views[container].pop();
    const dir = tempCopy({ "package.json": mutated });
    expect(readFileSync(join(dir, "package.json"), "utf8")).not.toContain(`"id": "${dropped.id}"`);
    const { status, stderr } = check(dir);
    expect(status).toBe(2);
    expect(stderr).toMatch(/MISMATCH package\.json contributes\.views/);
    expect(stderr).toContain(dropped.id);
  });

  it("MUST_BLOCK — a view title changed in package.nls.fr.json only -> exit 2, naming the file and key", () => {
    const fr = JSON.parse(readFileSync(join(ROOT, "package.nls.fr.json"), "utf8"));
    const key = viewTitleNlsKey(configViews()[0].id);
    fr[key] = "Autre chose";
    const dir = tempCopy({ "package.nls.fr.json": fr });
    expect(readFileSync(join(dir, "package.nls.fr.json"), "utf8")).toContain("Autre chose");
    const { status, stderr } = check(dir);
    expect(status).toBe(2);
    expect(stderr).toContain(`MISMATCH package.nls.fr.json ${key}`);
  });

  it("MUST_BLOCK — a stale view title key left in package.nls.json -> exit 2, naming it", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "package.nls.json"), "utf8"));
    en[viewTitleNlsKey("acme.gone")] = "Gone";
    const { status, stderr } = check(tempCopy({ "package.nls.json": en }));
    expect(status).toBe(2);
    expect(stderr).toContain(`MISMATCH package.nls.json ${viewTitleNlsKey("acme.gone")}`);
  });
});

/** A temp extension root: the committed package.json, nls files, config and media, with overrides. */
function tempCopy(overrides: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "vsx-manifest-"));
  for (const f of ["package.json", "package.nls.json", "package.nls.fr.json"])
    writeFileSync(
      join(dir, f),
      f in overrides ? JSON.stringify(overrides[f], null, 2) : readFileSync(join(ROOT, f), "utf8")
    );
  copyFileSync(CONFIG_PATH, join(dir, "extension.config.json"));
  cpSync(join(ROOT, "media"), join(dir, "media"), { recursive: true });
  return dir;
}

function check(dir: string): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts/manifest-sync.mjs"), "--check"], {
      cwd: dir,
      stdio: "pipe",
    });
    return { status: 0, stderr: "" };
  } catch (e) {
    const err = e as { status: number; stderr: Buffer };
    return { status: err.status, stderr: err.stderr.toString() };
  }
}
