import { join } from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE_NAME, loadConfig } from "./config";
import { type PanelViewProvider, registerPanelViews } from "./panel";
import { createProvider } from "./provider";

export interface ExtensionApi {
  readonly providerId: string;
  readonly provider: vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition>;
  /** The panel's webview view providers, by configured view id. */
  readonly views: ReadonlyMap<string, PanelViewProvider>;
}

/**
 * V-1: register the MCP server definition provider under the id read from the configuration;
 * package.json contributes the same id (derived from the same file, checked at build).
 * V-2: register one webview view per configured panel view, under its configured id.
 * A missing or malformed configuration refuses activation, naming the defect.
 */
export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const config = loadConfig(join(context.extensionPath, CONFIG_FILE_NAME));
  const provider = createProvider(config);
  context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider(config.id, provider));
  const views = registerPanelViews(context, config);
  return { providerId: config.id, provider, views };
}

export function deactivate(): void {}
