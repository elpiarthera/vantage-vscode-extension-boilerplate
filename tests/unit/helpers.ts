import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as vscode from "vscode";

export const ROOT = resolve(__dirname, "..", "..");
export const CONFIG_PATH = join(ROOT, "extension.config.json");

export function readConfigJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

/** The committed configuration's views, as raw JSON. */
export function configViews(): { id: string; title: { en: string; fr: string }; kind: string }[] {
  return readConfigJson().views as {
    id: string;
    title: { en: string; fr: string };
    kind: string;
  }[];
}

/** A fresh extension root in the OS temp dir holding the given config and the icon it names. */
export function tempExtensionRoot(config: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "vsx-ext-"));
  cpSync(join(ROOT, "media"), join(dir, "media"), { recursive: true });
  writeFileSync(join(dir, "extension.config.json"), JSON.stringify(config, null, 2));
  return dir;
}

/** A fake ExtensionContext: only the fields activate() reads. */
export function fakeContext(extensionPath: string) {
  return {
    extensionPath,
    extensionUri: vscode.Uri.file(extensionPath),
    subscriptions: [] as { dispose(): unknown }[],
  };
}

/** The host's real cspSource shape (a source expression VS Code owns) and resource origin. */
export const CSP_SOURCE = "'self' https://*.vscode-cdn.net";
export const RESOURCE_ORIGIN = "https://file+.vscode-resource.vscode-cdn.net";

/** A fake WebviewView: the webview fields a WebviewViewProvider reads and writes. */
export function fakeWebviewView() {
  const issued: string[] = [];
  const webview = {
    options: undefined as unknown,
    html: "",
    cspSource: CSP_SOURCE,
    asWebviewUri: (u: vscode.Uri) => {
      const out = vscode.Uri.parse(`${RESOURCE_ORIGIN}${u.path}`);
      issued.push(out.toString());
      return out;
    },
  };
  return { view: { webview } as unknown as vscode.WebviewView, webview, issued };
}

/**
 * Activate the extension at `root` and resolve the configured view `id` in a fake webview.
 * Returns the HTML it set and every URI the fake host minted for it (asWebviewUri).
 */
export async function resolvedView(id: string, root = ROOT) {
  const { activate } = await import("../../src/extension");
  const api = activate(fakeContext(root) as unknown as vscode.ExtensionContext);
  const provider = api.views.get(id);
  if (!provider) throw new Error(`no provider registered for ${id}`);
  const fake = fakeWebviewView();
  provider.resolveWebviewView(
    fake.view,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken
  );
  return { html: fake.webview.html, issued: fake.issued, options: fake.webview.options };
}
