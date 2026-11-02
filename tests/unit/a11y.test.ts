import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ROOT, configViews, resolvedView } from "./helpers";

// Accessibility of the generated page: axe-core in jsdom, once with the light token set and once with the
// dark one (mosaic tokens + the panel's mapping, applied as the host would). Gate: 0 serious/critical.
// jsdom has no layout engine, so axe reports colour contrast as "incomplete" (cannot compute), never as
// passed; the count is printed so the reader sees it — contrast is the host theme's (VS Code's) to hold.
const require = createRequire(import.meta.url);
const tokensCss = readFileSync(require.resolve("@vantageos/mosaic-tokens/css"), "utf8");
const panelCss = readFileSync(join(ROOT, "media", "webview", "panel.css"), "utf8");

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

async function audit(html: string, theme: Theme) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const { document } = dom.window;
  // the stylesheets the page links (served by the host in VS Code) are applied in place for jsdom
  const style = document.createElement("style");
  style.textContent = `${tokensCss}\n${panelCss}`;
  document.head.appendChild(style);
  document.documentElement.dataset.theme = theme;
  document.body.classList.add(theme === "dark" ? "vscode-dark" : "vscode-light");
  dom.window.eval(axe.source);
  const w = dom.window as unknown as { axe: typeof axe };
  const r = await w.axe.run(document, { resultTypes: ["violations", "incomplete"] });
  const blocking = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return { r, blocking, dom };
}

describe("accessibility (axe-core, jsdom)", () => {
  const cases = configViews().flatMap((v) => THEMES.map((t) => [v.id, t] as const));

  it.each(cases)("%s, %s tokens: 0 serious/critical violations", async (id, theme) => {
    const { html } = await resolvedView(id);
    const { r, blocking } = await audit(html, theme);
    const incomplete = r.incomplete.map((i) => `${i.id}(${i.nodes.length})`).join(",") || "none";
    console.log(
      `axe ${id} ${theme}: violations=${r.violations.length} serious/critical=${blocking.length} incomplete=${incomplete}`
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("MUST_BLOCK — an injected img without alt is found (critical)", async () => {
    const { html } = await resolvedView(configViews()[0].id);
    const mutated = html.replace("</main>", `<img src="x.png"></main>`);
    expect(mutated).toContain(`<img src="x.png">`); // landed
    const { blocking } = await audit(mutated, "light");
    expect(blocking.map((v) => v.id)).toContain("image-alt");
  });
});
