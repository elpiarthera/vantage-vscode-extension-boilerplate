import { strict as assert } from "node:assert";
import { join, resolve } from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE_NAME, loadConfig } from "../../../src/config";
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
});
