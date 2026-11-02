import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";
import { callProblems, l10nCalls, manifestKeys, parityProblems } from "./l10nCheck";

// V-6: every user-facing string exists in English and French — runtime strings through vscode.l10n
// bundles, manifest strings through package.nls(.fr).json.
const json = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const bundleEn = () => json("l10n", "bundle.l10n.json");
const bundleFr = () => json("l10n", "bundle.l10n.fr.json");
const nlsEn = () => json("package.nls.json");
const nlsFr = () => json("package.nls.fr.json");
const pkg = () => json("package.json");

describe("runtime strings (vscode.l10n)", () => {
  it("package.json points VS Code at the l10n folder", () => {
    expect(pkg().l10n).toBe("./l10n");
  });

  it("the source calls l10n.t (the scan reads something)", () => {
    expect(l10nCalls(join(ROOT, "src")).length).toBeGreaterThan(0);
  });

  it("every l10n.t key in src exists in the EN and the FR bundle", () => {
    expect(callProblems(l10nCalls(join(ROOT, "src")), bundleEn(), bundleFr())).toEqual([]);
  });

  it("the two bundles carry the same keys, none empty", () => {
    expect(
      parityProblems(bundleEn(), bundleFr(), { en: "bundle.l10n.json", fr: "bundle.l10n.fr.json" })
    ).toEqual([]);
  });

  it("no bundle key is left unused by the source", () => {
    const used = new Set(l10nCalls(join(ROOT, "src")).map((c) => c.key));
    expect(Object.keys(bundleEn()).filter((k) => !used.has(k))).toEqual([]);
  });

  // Positive controls
  it("MUST_BLOCK — a string removed from the FR bundle is named", () => {
    const fr = bundleFr();
    const [victim] = Object.keys(fr);
    delete fr[victim];
    expect(victim in fr).toBe(false); // landed
    expect(parityProblems(bundleEn(), fr)).toContain(`missing in fr: ${victim}`);
    expect(callProblems(l10nCalls(join(ROOT, "src")), bundleEn(), fr).join("\n")).toContain(
      `"${victim}" missing in bundle.l10n.fr.json`
    );
  });

  it("MUST_BLOCK — an empty FR value is named", () => {
    const fr = bundleFr();
    const [victim] = Object.keys(fr);
    fr[victim] = " ";
    expect(parityProblems(bundleEn(), fr)).toContain(`empty in fr: ${victim}`);
  });

  it("MUST_BLOCK — a call with a computed key is refused, never skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "vsx-l10n-"));
    writeFileSync(join(dir, "a.ts"), 'vscode.l10n.t(name);\nl10n.t("Not in any bundle");\n');
    const problems = callProblems(l10nCalls(dir), bundleEn(), bundleFr()).join("\n");
    expect(problems).toMatch(/could not judge a\.ts:1: l10n\.t\(name\)/);
    expect(problems).toMatch(/a\.ts:2: "Not in any bundle" missing in bundle\.l10n\.json/);
  });
});

describe("manifest strings (package.nls)", () => {
  it("package.json references nls keys (the check reads something)", () => {
    expect(manifestKeys(pkg()).length).toBeGreaterThan(0);
  });

  it("every %key% in package.json exists in package.nls.json and package.nls.fr.json", () => {
    const missing = manifestKeys(pkg()).flatMap((k) => [
      ...(k in nlsEn() ? [] : [`package.nls.json: ${k}`]),
      ...(k in nlsFr() ? [] : [`package.nls.fr.json: ${k}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it("the two nls files carry the same keys, none empty", () => {
    expect(
      parityProblems(nlsEn(), nlsFr(), { en: "package.nls.json", fr: "package.nls.fr.json" })
    ).toEqual([]);
  });

  it("MUST_BLOCK — a key removed from package.nls.fr.json is named", () => {
    const fr = nlsFr();
    const [victim] = Object.keys(fr);
    delete fr[victim];
    expect(victim in fr).toBe(false);
    expect(
      parityProblems(nlsEn(), fr, { en: "package.nls.json", fr: "package.nls.fr.json" })
    ).toContain(`missing in package.nls.fr.json: ${victim}`);
  });
});
