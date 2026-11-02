import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * V-6 readers. Two string surfaces, each with the same contract (same keys in both languages, no
 * empty value):
 *   - runtime: every `l10n.t(...)` call in the source; its message is the key of l10n/bundle.l10n*.json;
 *   - manifest: every `%key%` in package.json; the key of package.nls.json / package.nls.fr.json.
 * A call whose first argument is not a string literal cannot be judged and is refused, named.
 */

export interface Call {
  file: string;
  line: number;
  key?: string;
  /** set when the first argument is not a plain string literal */
  unreadable?: string;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Every `<expr>.l10n.t(...)` / `l10n.t(...)` call under dir, read from the TypeScript AST. */
export function l10nCalls(dir: string): Call[] {
  const list = files(dir);
  if (list.length === 0) throw new Error(`l10n scan: no source file under ${dir}`);
  const calls: Call[] = [];
  for (const file of list) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "t" &&
        /(^|\.)l10n$/.test(node.expression.expression.getText(sf))
      ) {
        const arg = node.arguments[0];
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const rel = relative(dir, file);
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
          calls.push({ file: rel, line, key: arg.text });
        else calls.push({ file: rel, line, unreadable: arg ? arg.getText(sf) : "(no argument)" });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return calls;
}

/** Key parity between two language tables; every problem names the key and the side. */
export function parityProblems(
  en: Record<string, unknown>,
  fr: Record<string, unknown>,
  names = { en: "en", fr: "fr" }
): string[] {
  const problems: string[] = [];
  for (const k of Object.keys(en)) if (!(k in fr)) problems.push(`missing in ${names.fr}: ${k}`);
  for (const k of Object.keys(fr)) if (!(k in en)) problems.push(`missing in ${names.en}: ${k}`);
  for (const [side, table] of [
    [names.en, en],
    [names.fr, fr],
  ] as const)
    for (const [k, v] of Object.entries(table))
      if (typeof v !== "string" || v.trim() === "") problems.push(`empty in ${side}: ${k}`);
  return problems;
}

/** Every runtime call's key present in both bundles, and every call readable. */
export function callProblems(
  calls: Call[],
  en: Record<string, unknown>,
  fr: Record<string, unknown>
): string[] {
  const problems: string[] = [];
  for (const c of calls) {
    if (c.unreadable !== undefined) {
      problems.push(
        `could not judge ${c.file}:${c.line}: l10n.t(${c.unreadable}) — key is not a string literal`
      );
      continue;
    }
    const key = c.key as string;
    if (!(key in en)) problems.push(`${c.file}:${c.line}: "${key}" missing in bundle.l10n.json`);
    if (!(key in fr)) problems.push(`${c.file}:${c.line}: "${key}" missing in bundle.l10n.fr.json`);
  }
  return problems;
}

/** Every `%key%` string anywhere in package.json. */
export function manifestKeys(pkg: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const m = /^%([^%]+)%$/.exec(v);
      if (m) out.push(m[1]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(pkg);
  return out;
}
