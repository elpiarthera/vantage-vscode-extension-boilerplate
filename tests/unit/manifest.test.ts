import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations
import { derivedFields, manifestMismatches } from "../../scripts/manifest-sync.mjs";
import { CONFIG_PATH, ROOT, readConfigJson } from "./helpers";

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

  it("names a vscode engine and activates only on its own MCP collection (V-12)", () => {
    const config = readConfigJson();
    expect(pkg().engines.vscode).toMatch(/^\^1\.\d+\.\d+$/);
    expect(pkg().activationEvents).toEqual([`onMcpCollection:${config.id}`]);
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
    const dir = mkdtempSync(join(tmpdir(), "vsx-manifest-"));
    const mutated = pkg();
    mutated.contributes.mcpServerDefinitionProviders[0].id = "someone-else";
    writeFileSync(join(dir, "package.json"), JSON.stringify(mutated, null, 2));
    copyFileSync(CONFIG_PATH, join(dir, "extension.config.json"));
    cpSync(join(ROOT, "media"), join(dir, "media"), { recursive: true });
    // landing asserted before reading the verdict
    expect(readFileSync(join(dir, "package.json"), "utf8")).toContain('"someone-else"');
    let status = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts/manifest-sync.mjs"), "--check"], {
        cwd: dir,
        stdio: "pipe",
      });
    } catch (e) {
      const err = e as { status: number; stderr: Buffer };
      status = err.status;
      stderr = err.stderr.toString();
    }
    expect(status).toBe(2);
    expect(stderr).toContain("contributes.mcpServerDefinitionProviders");
  });
});
