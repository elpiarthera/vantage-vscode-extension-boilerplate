import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colourProblems, danglingMosaicRefs } from "./cssCheck";
import { ROOT } from "./helpers";

// V-5: the panel's styles come from the mosaic tokens, and the tokens' colours are mapped onto the editor
// theme's variables (light, dark, high contrast). The panel stylesheet holds no colour of its own.
const require = createRequire(import.meta.url);
const tokensCss = readFileSync(require.resolve("@vantageos/mosaic-tokens/css"), "utf8");
const panelCss = readFileSync(join(ROOT, "media", "webview", "panel.css"), "utf8");

describe("panel stylesheet", () => {
  it("holds no colour literal: only --mosaic-* / --vscode-* references and whitelisted keywords", () => {
    expect(colourProblems(panelCss)).toEqual([]);
  });

  it("every --mosaic-* variable it reads is declared by the tokens (or mapped by the panel)", () => {
    expect(danglingMosaicRefs(panelCss, tokensCss)).toEqual([]);
  });

  it("maps the mosaic colour slots it reads onto editor theme variables", () => {
    const used = [
      ...new Set([...panelCss.matchAll(/var\(\s*(--mosaic-color-[a-z0-9-]+)/g)].map((m) => m[1])),
    ];
    expect(used.length).toBeGreaterThan(0);
    for (const slot of used)
      expect(panelCss).toMatch(new RegExp(`${slot}\\s*:\\s*var\\(\\s*--vscode-`));
  });

  it("reads the high-contrast border variable", () => {
    expect(panelCss).toContain("--vscode-contrastBorder");
  });

  // MUST_BLOCK — one per colour form
  it.each([
    ["a named colour", "p { color: red; }", /holds "red"/],
    ["a hex colour", "p { color: #fff; }", /hex colour/],
    ["rgb()", "p { background: rgb(0 0 0); }", /uses rgb\(\)/],
    ["oklch()", "p { border-color: oklch(0.5 0 0); }", /uses oklch\(\)/],
    ["a system colour", "p { color: Canvas; }", /holds "Canvas"/],
    ["a foreign variable", "p { color: var(--brand); }", /references --brand/],
    [
      "a named colour as a var() fallback",
      "p { color: var(--vscode-foreground, black); }",
      /holds "black"/,
    ],
  ])("MUST_BLOCK — %s is named", (_form, rule, finding) => {
    const css = `${panelCss}\n${rule}\n`;
    expect(css).toContain(rule); // landed
    expect(colourProblems(css).join("\n")).toMatch(finding);
  });

  it("MUST_BLOCK — a dangling --mosaic-* reference is named", () => {
    expect(
      danglingMosaicRefs(`${panelCss}\np { color: var(--mosaic-color-nope); }`, tokensCss)
    ).toEqual(["--mosaic-color-nope"]);
  });
});
