import { strict as assert } from "node:assert";
import { join, resolve } from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE_NAME, loadConfig, panelContainerId } from "../../../src/config";
import type { ExtensionApi } from "../../../src/extension";

// compiled to out-test/tests/integration/suite/extension.test.js
const ROOT = resolve(__dirname, "..", "..", "..", "..");

describe("extension host", () => {
  it("activates and provides the configured server as a Streamable HTTP definition", async () => {
    const config = loadConfig(join(ROOT, CONFIG_FILE_NAME));
    const ext = vscode.extensions.all.find((e) => resolve(e.extensionPath) === ROOT);
    assert.ok(ext, `extension under development not found at ${ROOT}`);
    // registerMcpServerDefinitionProvider throws in a real host if the id is not contributed,
    // so a successful activation proves the contribution and the registration agree (V-1).
    const api = (await ext.activate()) as ExtensionApi;
    assert.equal(api.providerId, config.id);
    const source = new vscode.CancellationTokenSource();
    const defs = (await api.provider.provideMcpServerDefinitions(source.token)) ?? [];
    assert.equal(defs.length, 1);
    const def = defs[0];
    assert.ok(def instanceof vscode.McpHttpServerDefinition, "not an McpHttpServerDefinition");
    assert.equal(def.label, config.label);
    assert.equal(def.uri.toString(), vscode.Uri.parse(config.url).toString());
    assert.deepEqual(def.headers ?? {}, {});
  });

  it("opens the panel: every configured view resolves and its webview receives HTML; an unconfigured id does not exist", async () => {
    const config = loadConfig(join(ROOT, CONFIG_FILE_NAME));
    assert.ok(config.views.length > 0, "the committed configuration has no view");
    const ext = vscode.extensions.all.find((e) => resolve(e.extensionPath) === ROOT);
    assert.ok(ext);
    const api = (await ext.activate()) as ExtensionApi;
    assert.deepEqual(
      [...api.views.keys()],
      config.views.map((v) => v.id)
    );

    await vscode.commands.executeCommand(`workbench.view.extension.${panelContainerId(config)}`);
    for (const view of config.views) {
      // VS Code generates `<viewId>.focus` for every contributed view; focusing it resolves the webview
      await vscode.commands.executeCommand(`${view.id}.focus`);
      const provider = api.views.get(view.id);
      assert.ok(provider, `no provider for ${view.id}`);
      const html = await waitFor(() => provider.html, `${view.id} never received HTML`);
      assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none';/);
      assert.ok(
        html.includes(view.title.en) || html.includes(view.title.fr),
        `${view.id}: title missing`
      );
      console.log(`integration: ${view.id} resolved, ${html.length} bytes of HTML`);
    }

    const unconfigured = `${config.id}.unconfigured-view`;
    const commands = await vscode.commands.getCommands(true);
    for (const view of config.views)
      assert.ok(commands.includes(`${view.id}.focus`), `${view.id}.focus missing`);
    assert.ok(!commands.includes(`${unconfigured}.focus`), `${unconfigured} exists`);
    await assert.rejects(Promise.resolve(vscode.commands.executeCommand(`${unconfigured}.focus`)));
    assert.equal(api.views.has(unconfigured), false);
  });
});

async function waitFor<T>(read: () => T | undefined, message: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = read();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(message);
    await new Promise((r) => setTimeout(r, 100));
  }
}
