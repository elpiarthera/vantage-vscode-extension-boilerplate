/**
 * V-5 HTML contract for a webview page, read from the HTML string the provider sets.
 *
 * Domain of what can pull a resource or run code in a page, and the check that covers each:
 *   - the CSP itself: exactly one <meta http-equiv="Content-Security-Policy">, placed before any
 *     element that loads something, `default-src 'none'`, and every source in every directive one
 *     of: 'none', the page's single nonce (script-src only), or the host's own `cspSource` tokens;
 *   - <script>: every one carries the CSP nonce;
 *   - any URL with an authority (`scheme://` or protocol-relative `//`), anywhere in the text,
 *     attributes included: must be one the host minted for the extension's own files (asWebviewUri);
 *   - scheme URLs without an authority (`javascript:`, `data:`, `blob:`, `vbscript:`, `filesystem:`);
 *   - inline styles (`<style>`, `style=`) and inline handlers (`on…=`), which bypass the token files.
 * Anything the reader cannot parse (no <html>, no <head>, no CSP) is a problem, named — never a pass.
 *
 * Declared divergence: the host's `cspSource` (e.g. `'self' https://*.vscode-cdn.net`) contains a
 * wildcard host and a scheme. It is VS Code's own resource origin, passed in by the host; it is the
 * only such source accepted, and only verbatim.
 */
export interface ContractInput {
  /** webview.cspSource as the host gave it. */
  cspSource: string;
  /** Every URI the host minted with asWebviewUri for this page. */
  assetUris: string[];
}

const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi;
const LOADING_TAG = /<(link|script|style|img|iframe|object|embed|source|video|audio|base)\b/i;

export function htmlContractProblems(html: string, input: ContractInput): string[] {
  const problems: string[] = [];
  if (!/<html\b/i.test(html)) problems.push("no <html> element");
  if (!/<head\b/i.test(html)) problems.push("no <head> element");

  const metas = [...html.matchAll(CSP_META)];
  if (metas.length === 0) {
    problems.push("no Content-Security-Policy meta");
    return problems;
  }
  if (metas.length > 1)
    problems.push(`${metas.length} Content-Security-Policy metas (exactly one expected)`);
  const meta = metas[0];
  const firstLoad = html.search(LOADING_TAG);
  if (firstLoad !== -1 && firstLoad < (meta.index ?? 0))
    problems.push("an element loads a resource before the Content-Security-Policy meta");

  // --- the policy
  const hostTokens = input.cspSource.split(/\s+/).filter(Boolean);
  const directives = new Map<string, string[]>();
  for (const part of meta[1].split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  const def = directives.get("default-src");
  if (!def || def.join(" ") !== "'none'")
    problems.push(`default-src is ${JSON.stringify(def?.join(" ") ?? null)}, expected 'none'`);
  const nonces = new Set<string>();
  for (const [name, sources] of directives) {
    for (const src of sources) {
      const nonce = /^'nonce-([A-Za-z0-9+/_=-]+)'$/.exec(src);
      if (nonce && name === "script-src") {
        nonces.add(nonce[1]);
        continue;
      }
      if (src === "'none'" || hostTokens.includes(src)) continue;
      problems.push(`CSP ${name} allows ${src}`);
    }
  }
  if (nonces.size !== 1)
    problems.push(`script-src carries ${nonces.size} nonces (exactly one expected)`);
  const [nonce] = [...nonces];

  // --- scripts
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const got = /\snonce="([^"]*)"/.exec(m[0])?.[1];
    if (got === undefined) problems.push(`script without nonce: ${m[0]}`);
    else if (got !== nonce) problems.push(`script with a nonce that is not the CSP's: ${m[0]}`);
  }

  // --- URLs (the policy text is read above, so it is cut out here)
  const body = html.replace(meta[0], "");
  const allowed = new Set(input.assetUris);
  for (const m of body.matchAll(/(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>()]+/gi))
    if (!allowed.has(m[0]))
      problems.push(`URL not minted by the host for the extension's files: ${m[0]}`);
  for (const m of body.matchAll(/\b(javascript|data|blob|vbscript|filesystem):(?!\/\/)/gi))
    problems.push(`scheme URL ${m[1]}: in the page`);

  // --- inline style and handlers
  if (/<style\b/i.test(body)) problems.push("inline <style> element");
  for (const m of body.matchAll(/<[a-z][^>]*\sstyle\s*=/gi))
    problems.push(`inline style attribute: ${m[0]}`);
  for (const m of body.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=/gi))
    problems.push(`inline handler ${m[1]}`);
  return problems;
}
