import * as vscode from "vscode";
import { type ExtensionConfig, type ViewConfig, type ViewKind, pickLanguage } from "./config";
import { createNonce, renderPage } from "./webviewHtml";

/**
 * The extension's own files a panel page loads, relative to the extension root. The mosaic tokens
 * are copied from @vantageos/mosaic-tokens at build (scripts/webview-assets.mjs); panel.css maps
 * them onto the editor theme; panel.js maps the editor theme kind onto the token theme.
 */
export const WEBVIEW_ASSETS = {
  styles: [
    ["out", "webview", "mosaic-tokens.css"],
    ["media", "webview", "panel.css"],
  ],
  scripts: [["media", "webview", "panel.js"]],
} as const;

/** The folders those files live in: the only local resources a panel webview may load. */
const RESOURCE_ROOTS = [
  ["out", "webview"],
  ["media", "webview"],
] as const;

/**
 * Placeholder texts per view kind, in the editor's language (vscode.l10n; FR in
 * l10n/bundle.l10n.fr.json). The record is exhaustive over ViewKind: a new kind does not compile
 * until its texts exist. Data from the MCP server replaces these in a later release.
 */
export function placeholderTexts(kind: ViewKind): { heading: string; body: string } {
  const texts: Record<ViewKind, () => { heading: string; body: string }> = {
    tasks: () => ({
      heading: vscode.l10n.t("No tasks to show yet."),
      body: vscode.l10n.t("This view will list the tasks of the MCP server once it is connected."),
    }),
    messages: () => ({
      heading: vscode.l10n.t("No messages to show yet."),
      body: vscode.l10n.t(
        "This view will list the messages of the MCP server once it is connected."
      ),
    }),
    memory: () => ({
      heading: vscode.l10n.t("No memories to show yet."),
      body: vscode.l10n.t(
        "This view will list the memories of the MCP server once it is connected."
      ),
    }),
  };
  return texts[kind]();
}

/** One webview view of the panel, rendering the configured view. */
export class PanelViewProvider implements vscode.WebviewViewProvider {
  /** The HTML last set on the webview (read by the integration test). */
  html: string | undefined;

  constructor(
    readonly view: ViewConfig,
    private readonly extensionUri: vscode.Uri
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const { webview } = webviewView;
    const file = (segments: readonly string[]) =>
      vscode.Uri.joinPath(this.extensionUri, ...segments);
    webview.options = {
      enableScripts: true,
      localResourceRoots: RESOURCE_ROOTS.map(file),
    };
    const lang = pickLanguage(vscode.env.language);
    const { heading, body } = placeholderTexts(this.view.kind);
    this.html = renderPage({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      lang,
      title: this.view.title[lang],
      heading,
      body,
      styles: WEBVIEW_ASSETS.styles.map((s) => webview.asWebviewUri(file(s)).toString()),
      scripts: WEBVIEW_ASSETS.scripts.map((s) => webview.asWebviewUri(file(s)).toString()),
    });
    webview.html = this.html;
  }
}

/**
 * V-2: one webview view provider per view of the configuration, registered under its configured
 * id; package.json contributes the same ids (derived from the same file, checked at build).
 */
export function registerPanelViews(
  context: vscode.ExtensionContext,
  config: ExtensionConfig
): Map<string, PanelViewProvider> {
  const providers = new Map<string, PanelViewProvider>();
  for (const view of config.views) {
    const provider = new PanelViewProvider(view, context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(view.id, provider));
    providers.set(view.id, provider);
  }
  return providers;
}
