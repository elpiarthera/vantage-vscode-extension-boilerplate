import { describe, expect, it } from "vitest";
import { CSP_SOURCE, ROOT, configViews, resolvedView } from "./helpers";
import { htmlContractProblems } from "./htmlContract";

// V-5: strict CSP (default-src 'none', scripts by nonce only), nothing remote, every asset an
// extension file minted by the host. One positive control per form the contract reads.
const views = configViews();

async function page(id = views[0].id) {
  const r = await resolvedView(id);
  return { ...r, input: { cspSource: CSP_SOURCE, assetUris: r.issued } };
}

describe("webview HTML contract", () => {
  it.each(views.map((v) => [v.id]))("%s: the generated page meets the contract", async (id) => {
    const { html, input } = await page(id);
    expect(htmlContractProblems(html, input)).toEqual([]);
  });

  it("every asset URI the page uses was minted for a file inside the extension", async () => {
    const { issued } = await page();
    expect(issued.length).toBeGreaterThan(0);
    for (const u of issued)
      expect(decodeURIComponent(new URL(u).pathname).startsWith(`${ROOT}/`)).toBe(true);
  });

  it("the nonce changes on every render", async () => {
    const nonceOf = (html: string) => /'nonce-([^']+)'/.exec(html)?.[1];
    const a = nonceOf((await page()).html);
    const b = nonceOf((await page()).html);
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect((a ?? "").length).toBeGreaterThanOrEqual(22); // >= 128 bits, base64
  });

  // MUST_BLOCK — one mutation per form, landing asserted before the verdict is read.
  const mutations: [string, (h: string) => string, RegExp][] = [
    [
      "a remote https src",
      (h) => h.replace("</main>", `<img src="https://evil.test/x.png" alt="x"></main>`),
      /URL not minted.*https:\/\/evil\.test\/x\.png/,
    ],
    [
      "a remote http href",
      (h) => h.replace("</main>", `<a href="http://evil.test/">x</a></main>`),
      /URL not minted.*http:\/\/evil\.test/,
    ],
    [
      "a protocol-relative src",
      (h) => h.replace("</main>", `<img src="//evil.test/x.png" alt="x"></main>`),
      /URL not minted.*\/\/evil\.test/,
    ],
    [
      "a javascript: URL",
      (h) => h.replace("</main>", `<a href="javascript:alert(1)">x</a></main>`),
      /scheme URL javascript:/,
    ],
    [
      "a data: URL",
      (h) => h.replace("</main>", `<img src="data:image/png;base64,AA" alt="x"></main>`),
      /scheme URL data:/,
    ],
    [
      "a script without nonce",
      (h) => h.replace("</body>", "<script>1</script></body>"),
      /script without nonce/,
    ],
    [
      "a script with another nonce",
      (h) => h.replace("</body>", `<script nonce="AAAA">1</script></body>`),
      /nonce that is not the CSP's/,
    ],
    [
      "a CSP wildcard",
      (h) => h.replace("default-src 'none';", "default-src 'none'; img-src *;"),
      /CSP img-src allows \*/,
    ],
    [
      "a CSP https: scheme",
      (h) => h.replace("default-src 'none';", "default-src 'none'; connect-src https:;"),
      /CSP connect-src allows https:/,
    ],
    [
      "unsafe-inline scripts",
      (h) => h.replace("script-src ", "script-src 'unsafe-inline' "),
      /CSP script-src allows 'unsafe-inline'/,
    ],
    [
      "default-src not none",
      (h) => h.replace("default-src 'none'", "default-src 'self'"),
      /default-src is/,
    ],
    [
      "no CSP",
      (h) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""),
      /no Content-Security-Policy meta/,
    ],
    [
      "an inline style attribute",
      (h) => h.replace("<main", `<main style="color:red"`),
      /inline style attribute/,
    ],
    [
      "an inline <style>",
      (h) => h.replace("</head>", "<style>p{}</style></head>"),
      /inline <style> element/,
    ],
    [
      "an inline handler",
      (h) => h.replace("<main", `<main onclick="x()"`),
      /inline handler onclick/,
    ],
  ];

  it.each(mutations)("MUST_BLOCK — %s", async (_form, mutate, finding) => {
    const { html, input } = await page();
    const mutated = mutate(html);
    expect(mutated).not.toBe(html); // the mutation landed
    expect(htmlContractProblems(mutated, input).join("\n")).toMatch(finding);
  });
});
