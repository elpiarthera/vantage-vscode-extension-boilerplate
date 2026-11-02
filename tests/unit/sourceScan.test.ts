import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, readConfigJson } from "./helpers";
import { type ScanRule, V1_RULES, V3_RULES, scan, stripComments, v2Rules } from "./sourceScan";

const SRC = join(ROOT, "src");
const config = readConfigJson() as Parameters<typeof v2Rules>[0];
// Every configured view id is part of the V-2 domain, plus one id the committed config does not carry
// (a fork's view must be refused just the same).
const configWithView = { ...config, views: [...config.views, { id: "vantage.items-panel" }] };

/** One injected violation per rule: a source tree the rule's author did not write. */
const INJECTIONS: Record<string, string> = {
  "V-2 url literal": `const u = "${config.url}";`,
  "V-2 url host literal": `const u = "https://" + "${new URL(config.url).host}" + "/mcp";`,
  "V-2 label literal": `const l = "${config.label}";`,
  "V-2 provider id literal": `const id = '${config.id}';`,
  "V-2 view id literal vantage.items-panel": `registerWebviewViewProvider("vantage.items-panel", p);`,
  "V-1 literal provider id at registration": `vscode.lm.registerMcpServerDefinitionProvider("x", p);`,
  "V-3 Authorization header": "new vscode.McpHttpServerDefinition(l, u, { Authorization: t });",
  "V-3 Bearer scheme": "const h = `Bearer ${t}`;",
  "V-3 secrets read/write": `await context.secrets.store("k", v);`,
  "V-3 credential written to state": `context.globalState.update("accessToken", t);`,
  "V-3 credential logged": `console.log("access_token", t);`,
  "V-3 stdio definition for a remote server": `new vscode.McpStdioServerDefinition(l, "npx");`,
  // one injection per committed view id, in the form a registration would take
  ...Object.fromEntries(
    config.views.map((v) => [
      `V-2 view id literal ${v.id}`,
      `vscode.window.registerWebviewViewProvider("${v.id}", p);`,
    ])
  ),
};

const ALL_RULES: ScanRule[] = [...v2Rules(configWithView), ...V1_RULES, ...V3_RULES];

function treeWith(line: string): string {
  const dir = mkdtempSync(join(tmpdir(), "vsx-scan-"));
  mkdirSync(join(dir, "nested"));
  writeFileSync(join(dir, "nested", "injected.ts"), `export {};\n${line}\n`);
  return dir;
}

describe("source scan (V-1, V-2, V-3)", () => {
  it("the committed configuration has views, so the view-id rules are not vacuous", () => {
    expect(config.views.length).toBeGreaterThan(0);
  });

  it("src/ holds no server literal, no literal registration id, no credential handling", () => {
    expect(scan(SRC, ALL_RULES)).toEqual([]);
  });

  it("every rule has its injection (the census is complete)", () => {
    expect(ALL_RULES.map((r) => r.rule).sort()).toEqual(Object.keys(INJECTIONS).sort());
  });

  // Positive control, one per form: the rule can match, so the zero above means something.
  it.each(Object.entries(INJECTIONS))("%s: an injected violation is found", (rule, line) => {
    const findings = scan(treeWith(line), ALL_RULES);
    expect(findings.map((f) => f.rule)).toContain(rule);
    expect(findings.find((f) => f.rule === rule)?.file).toBe(join("nested", "injected.ts"));
  });

  it("refuses an empty tree instead of passing it", () => {
    const empty = mkdtempSync(join(tmpdir(), "vsx-scan-empty-"));
    expect(() => scan(empty, ALL_RULES)).toThrow(/no source file/);
  });
});

describe("stripComments()", () => {
  it("blanks comments but keeps a URL inside a string literal and the line count", () => {
    const text = `// Authorization in prose\nconst u = "https://x.test/mcp"; /* Bearer */\n`;
    const out = stripComments(text);
    expect(out).not.toMatch(/Authorization|Bearer/);
    expect(out).toContain('"https://x.test/mcp"');
    expect(out.split("\n")).toHaveLength(text.split("\n").length);
  });
});

// V-3 "a token written to state or a log": the credential may be named by the key (a literal or an identifier) or
// carried by the value, and an API key is a credential in a log too. One injection per form (P1 is the reviewer's
// probe on PR #1).
describe("V-3 state and log rules read every form of the credential", () => {
  const stateRule = V3_RULES.filter((r) => r.rule === "V-3 credential written to state");
  const logRule = V3_RULES.filter((r) => r.rule === "V-3 credential logged");
  it.each([
    ["key literal", `context.globalState.update("accessToken", t);`],
    ["key identifier", "context.workspaceState.update(TOKEN_KEY, v);"],
    ["value (P1)", "c.globalState.update(K, s.accessToken);"],
  ])("state, %s -> found", (_form, line) => {
    expect(scan(treeWith(line), stateRule).map((f) => f.rule)).toEqual([
      "V-3 credential written to state",
    ]);
  });
  it("state, a non-credential key and value -> not found (positive control the other way)", () => {
    expect(scan(treeWith(`context.globalState.update("lastView", id);`), stateRule)).toEqual([]);
  });
  it("log, an API key -> found", () => {
    expect(scan(treeWith(`console.warn("key", apiKey);`), logRule).map((f) => f.rule)).toEqual([
      "V-3 credential logged",
    ]);
  });
});
