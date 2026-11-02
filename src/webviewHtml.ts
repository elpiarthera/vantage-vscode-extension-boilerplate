import { randomBytes } from "node:crypto";

/**
 * V-5: the page a panel view shows. Pure (no `vscode` import) so its contract is tested directly.
 *
 * - CSP: `default-src 'none'`; styles only from the host's resource origin (`cspSource`); scripts only
 *   by the per-render nonce. No remote origin, no inline style, no inline handler.
 * - Every asset URI is passed in by the caller, minted by the host (`webview.asWebviewUri`) from the
 *   extension's own files.
 * - Every text is passed in by the host, already in the editor's language; the page never reads the
 *   locale. The content is plain HTML that reads without the script (V-12 text fallback): the script
 *   only maps the editor's theme kind onto the mosaic token theme.
 */
export interface PageInput {
  /** webview.cspSource, verbatim. */
  cspSource: string;
  /** Per-render nonce (createNonce). */
  nonce: string;
  /** BCP 47 language of the texts. */
  lang: string;
  /** View title (page title and h1). */
  title: string;
  /** Empty-state heading. */
  heading: string;
  /** Empty-state body. */
  body: string;
  /** Stylesheet URIs, in cascade order. */
  styles: string[];
  /** Script URIs. */
  scripts: string[];
}

/** 128 random bits, base64 — a fresh one for every render. */
export function createNonce(): string {
  return randomBytes(16).toString("base64");
}

/** Escape a text node. */
export function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** Escape a double-quoted attribute value. */
export function escapeAttr(value: string): string {
  return value.replace(/[&"]/g, (c) => (c === "&" ? "&amp;" : "&quot;"));
}

export function renderPage(p: PageInput): string {
  const t = escapeText;
  const a = escapeAttr;
  const csp = [
    "default-src 'none'",
    `style-src ${p.cspSource}`,
    `script-src 'nonce-${p.nonce}'`,
  ].join("; ");
  const links = p.styles.map((u) => `<link rel="stylesheet" href="${a(u)}">`).join("\n    ");
  const scripts = p.scripts
    .map((u) => `<script nonce="${a(p.nonce)}" src="${a(u)}"></script>`)
    .join("\n    ");
  return `<!DOCTYPE html>
<html lang="${a(p.lang)}">
  <head>
    <meta http-equiv="Content-Security-Policy" content="${a(csp)};">
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${t(p.title)}</title>
    ${links}
  </head>
  <body>
    <main class="mosaic-panel">
      <h1 class="mosaic-panel__title">${t(p.title)}</h1>
      <section class="mosaic-empty-state" aria-labelledby="empty-state-heading">
        <h2 id="empty-state-heading" class="mosaic-empty-state__heading">${t(p.heading)}</h2>
        <p class="mosaic-empty-state__body">${t(p.body)}</p>
      </section>
    </main>
    ${scripts}
  </body>
</html>
`;
}
