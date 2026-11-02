import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { activate } from "../../src/extension";
import { ROOT, fakeContext, readConfigJson, tempExtensionRoot } from "./helpers";

// V-1: activation registers exactly the configured provider id.
// V-3: the provider returns one Streamable HTTP definition for the configured URL, with no header.
const register = vi.mocked(vscode.lm.registerMcpServerDefinitionProvider);

beforeEach(() => register.mockClear());

async function definitionsOf(provider: unknown) {
  const p = provider as vscode.McpServerDefinitionProvider;
  return (await p.provideMcpServerDefinitions({} as vscode.CancellationToken)) ?? [];
}

describe("activate()", () => {
  it("registers exactly one provider, under the id read from extension.config.json", () => {
    const config = readConfigJson();
    const context = fakeContext(ROOT);
    activate(context as unknown as vscode.ExtensionContext);
    expect(register.mock.calls).toHaveLength(1);
    expect(register.mock.calls[0][0]).toBe(config.id);
    expect(context.subscriptions).toHaveLength(1);
  });

  it("provides one HTTP definition with the configured label and URL, and no header", async () => {
    const config = readConfigJson();
    activate(fakeContext(ROOT) as unknown as vscode.ExtensionContext);
    const defs = await definitionsOf(register.mock.calls[0][1]);
    expect(defs).toHaveLength(1);
    const def = defs[0] as vscode.McpHttpServerDefinition;
    expect(def).toBeInstanceOf(vscode.McpHttpServerDefinition);
    expect(def.label).toBe(config.label);
    expect(def.uri.toString()).toBe(vscode.Uri.parse(String(config.url)).toString());
    expect(def.headers).toEqual({});
  });

  it("a second configuration file yields a second server with zero code change", async () => {
    const second = {
      ...readConfigJson(),
      id: "acme-crm",
      label: "Acme CRM",
      url: "https://crm.acme.test/mcp",
    };
    const root = tempExtensionRoot(second);
    activate(fakeContext(root) as unknown as vscode.ExtensionContext);
    expect(register.mock.calls[0][0]).toBe("acme-crm");
    const [def] = (await definitionsOf(
      register.mock.calls[0][1]
    )) as vscode.McpHttpServerDefinition[];
    expect(def.label).toBe("Acme CRM");
    expect(def.uri.toString()).toBe("https://crm.acme.test/mcp");
  });

  it("refuses to activate on a configuration missing a required key, naming it", () => {
    const { url: _drop, ...broken } = readConfigJson();
    const root = tempExtensionRoot(broken);
    expect(() => activate(fakeContext(root) as unknown as vscode.ExtensionContext)).toThrow(
      /missing required key "url"/
    );
    expect(register.mock.calls).toHaveLength(0);
  });
});
