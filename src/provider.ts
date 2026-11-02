import * as vscode from "vscode";
import type { ExtensionConfig } from "./config";

/**
 * V-3: the server is remote, so it is a Streamable HTTP definition for the configured URL.
 * No header is set: authentication is VS Code's own MCP OAuth against the server's
 * authorization server. This extension never reads, stores, logs or forwards a token.
 */
export function createProvider(
  config: ExtensionConfig
): vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition> {
  return {
    provideMcpServerDefinitions: () => [
      new vscode.McpHttpServerDefinition(config.label, vscode.Uri.parse(config.url)),
    ],
  };
}
