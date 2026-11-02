/**
 * V-5 "a hard-coded colour outside the tokens", for the panel stylesheet.
 *
 * The forms a colour can take in a CSS value are open-ended (hex, a dozen colour functions, ~150
 * named colours, system colours), so this reader does not enumerate colours: it WHITELISTS. Every
 * declaration value, once its `var(--mosaic-…)` / `var(--vscode-…)` references, numbers, lengths and
 * punctuation are removed, may only hold identifiers from VOCABULARY and functions from FUNCTIONS. Anything else — `red`, `#fff`,
 * `rgb(`, `oklch(`, a `var(--other)` — is a problem, named. A new legitimate keyword is added to the
 * vocabulary on purpose, never accepted silently.
 */
export const VOCABULARY = new Set([
  "none",
  "solid",
  "auto",
  "block",
  "flex",
  "column",
  "center",
  "inherit",
  "transparent",
  "currentcolor",
  "normal",
  "border-box",
  "hidden",
  "visible",
  "absolute",
  "relative",
  "nowrap",
  "wrap",
  "start",
  "stretch",
  "underline",
]);

/** CSS functions that take no colour argument (geometry only). */
export const FUNCTIONS = new Set(["calc", "inset"]);

const VAR_REF = /var\(\s*(--[A-Za-z0-9-]+)/g;

export interface Declaration {
  property: string;
  value: string;
  line: number;
}

/** Declarations of a flat stylesheet (comments removed; @media blocks read like rules). */
export function declarations(css: string): Declaration[] {
  const out: Declaration[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const re = /([-A-Za-z0-9]+)\s*:\s*([^;{}]+);/g;
  for (const m of text.matchAll(re)) {
    out.push({
      property: m[1],
      value: m[2].trim(),
      line: text.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

export function colourProblems(css: string): string[] {
  const problems: string[] = [];
  const decls = declarations(css);
  if (decls.length === 0) return ["no declaration read from the stylesheet"];
  for (const d of decls) {
    for (const m of d.value.matchAll(VAR_REF))
      if (!/^--(mosaic|vscode)-/.test(m[1]))
        problems.push(
          `line ${d.line}: ${d.property} references ${m[1]} (only --mosaic-* and --vscode-* variables)`
        );
    // drop each `var(--name` head; a fallback stays in the value and is read like the rest
    const rest = d.value.replace(/var\(\s*--[A-Za-z0-9-]+\s*,?/g, " ");
    if (/#[0-9a-f]{3,8}\b/i.test(rest))
      problems.push(`line ${d.line}: ${d.property} has a hex colour: ${d.value}`);
    for (const fn of rest.matchAll(/([A-Za-z-]+)\(/g))
      if (!FUNCTIONS.has(fn[1].toLowerCase()))
        problems.push(`line ${d.line}: ${d.property} uses ${fn[1]}(): ${d.value}`);
    const idents =
      rest
        .replace(/[A-Za-z-]+\(/g, " ")
        .replace(/-?\d*\.?\d+(px|em|rem|%|ms|s|ch|vh|vw)?/g, " ")
        .match(/[A-Za-z][A-Za-z-]*/g) ?? [];
    for (const id of idents)
      if (!VOCABULARY.has(id.toLowerCase()))
        problems.push(
          `line ${d.line}: ${d.property} holds "${id}", not a token reference nor a whitelisted keyword`
        );
  }
  return problems;
}

/** Every var(--mosaic-…) the stylesheet reads, that neither it nor the tokens declare. */
export function danglingMosaicRefs(css: string, tokensCss: string): string[] {
  const declared = new Set(
    [...`${tokensCss}\n${css}`.matchAll(/(--mosaic-[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1])
  );
  const used = new Set([...css.matchAll(/var\(\s*(--mosaic-[A-Za-z0-9-]+)/g)].map((m) => m[1]));
  return [...used].filter((u) => !declared.has(u));
}
