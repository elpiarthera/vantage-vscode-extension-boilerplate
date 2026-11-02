import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { activate } from "../../src/extension";
import {
  ROOT,
  configViews,
  fakeContext,
  fakeWebviewView,
  readConfigJson,
  tempExtensionRoot,
} from "./helpers";

// V-2: the panel views come from extension.config.json `views`; the source names none of them.
const registerView = vi.mocked(vscode.window.registerWebviewViewProvider);
const registeredIds = () => registerView.mock.calls.map((c) => c[0]);
const run = (root: string) => activate(fakeContext(root) as unknown as vscode.ExtensionContext);

beforeEach(() => registerView.mockClear());
afterEach(() => {
  vscode.env.language = "en";
});

describe("panel views registration", () => {
  it("registers one webview view provider per configured view, under its config id, in order", () => {
    const api = run(ROOT);
    const ids = configViews().map((v) => v.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(registeredIds()).toEqual(ids);
    expect([...api.views.keys()]).toEqual(ids);
  });

  it("each registration is disposed with the extension (pushed to subscriptions)", () => {
    const context = fakeContext(ROOT);
    activate(context as unknown as vscode.ExtensionContext);
    // one MCP provider + one per view
    expect(context.subscriptions).toHaveLength(1 + configViews().length);
  });

  it("an id that is not in the configuration is never registered", () => {
    run(ROOT);
    expect(registeredIds()).not.toContain("vantage-mcp.unconfigured");
  });

  it("removing a view from the configuration removes its registration, with zero code change", () => {
    const [dropped, ...kept] = configViews();
    run(tempExtensionRoot({ ...readConfigJson(), views: kept }));
    expect(registeredIds()).toEqual(kept.map((v) => v.id));
    expect(registeredIds()).not.toContain(dropped.id);
  });

  it("adding a view of an existing kind registers it, with zero code change", () => {
    const extra = { id: "acme.more-tasks", title: { en: "More", fr: "Plus" }, kind: "tasks" };
    run(tempExtensionRoot({ ...readConfigJson(), views: [...configViews(), extra] }));
    expect(registeredIds()).toContain("acme.more-tasks");
  });

  it("no view configured -> no webview view registered", () => {
    run(tempExtensionRoot({ ...readConfigJson(), views: [] }));
    expect(registeredIds()).toEqual([]);
  });
});

describe("resolveWebviewView()", () => {
  const resolveFirst = () => {
    const api = run(ROOT);
    const [first] = configViews();
    const provider = api.views.get(first.id);
    if (!provider) throw new Error(`no provider for ${first.id}`);
    const fake = fakeWebviewView();
    provider.resolveWebviewView(
      fake.view,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken
    );
    return { first, provider, ...fake };
  };

  it("enables scripts and restricts local resources to the extension's webview asset folders", () => {
    const { webview } = resolveFirst();
    const options = webview.options as vscode.WebviewOptions;
    expect(options.enableScripts).toBe(true);
    const roots = (options.localResourceRoots ?? []).map((u) => u.path);
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots) expect(r.startsWith(`${ROOT}/`)).toBe(true);
  });

  it("sets HTML carrying the English title and lang=en on an English editor", () => {
    const { first, webview, provider } = resolveFirst();
    expect(webview.html).toContain(`<html lang="en">`);
    expect(webview.html).toContain(first.title.en);
    expect(provider.html).toBe(webview.html);
  });

  it("follows a French editor: lang=fr, the French title and the French runtime strings", () => {
    const en = resolveFirst().webview.html;
    vscode.env.language = "fr";
    const { first, webview } = resolveFirst();
    const fr = webview.html;
    expect(fr).toContain(`<html lang="fr">`);
    expect(fr).toContain(first.title.fr);
    // every runtime string the English page shows is shown in French on the French page
    const bundle = JSON.parse(readFileSync(join(ROOT, "l10n", "bundle.l10n.fr.json"), "utf8"));
    const shown = Object.keys(bundle).filter((k) => en.includes(k));
    expect(shown.length).toBeGreaterThan(0);
    for (const k of shown) expect(fr).toContain(bundle[k]);
  });
});
