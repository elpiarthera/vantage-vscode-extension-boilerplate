import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

export interface Finding {
  rule: string;
  file: string;
  line: number;
  text: string;
}

export interface ScanRule {
  rule: string;
  pattern: RegExp;
}

/**
 * V-3 forms, derived from the standard's detector ("every source use of Authorization, token,
 * secrets.store, globalState.update with a credential-shaped key"; red: a stdio definition, an
 * Authorization header, a token written to state or a log). One rule per form.
 * "A token written to state": the credential can be named by the KEY (a literal or an identifier such as
 * `TOKEN_KEY`) or carried by the VALUE (`s.accessToken`); the state rule reads the whole argument list of
 * `<x>State.update(...)`, so all three forms are refused.
 * Declared divergence: a key reached through bracket access (`globalState["update"]`) or a
 * header object built elsewhere and passed as a variable is not read by this scan.
 */
export const V3_RULES: ScanRule[] = [
  { rule: "V-3 Authorization header", pattern: /\bAuthorization\b/i },
  { rule: "V-3 Bearer scheme", pattern: /\bBearer\b/ },
  { rule: "V-3 secrets read/write", pattern: /\bsecrets\s*\.\s*(store|get)\s*\(/ },
  {
    rule: "V-3 credential written to state",
    pattern:
      /\b\w*State\s*\.\s*update\s*\([^)]*(token|secret|password|credential|api[-_]?key|bearer)/i,
  },
  {
    rule: "V-3 credential logged",
    pattern:
      /(\bconsole\s*\.\s*\w+|\.\s*append(Line)?|\.\s*(trace|debug|info|warn|error))\s*\([^)]*(access[-_]?token|refresh[-_]?token|id[-_]?token|secret|password|bearer|api[-_]?key)/i,
  },
  { rule: "V-3 stdio definition for a remote server", pattern: /\bMcpStdioServerDefinition\b/ },
];

/** V-1: the registered id is never a literal (it is the configured id). */
export const V1_RULES: ScanRule[] = [
  {
    rule: "V-1 literal provider id at registration",
    pattern: /registerMcpServerDefinitionProvider\s*\(\s*[`'"]/,
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * V-2 forms, derived from the configuration file itself: every server value the file holds
 * (url, its host, label, provider id, each view id) is refused as a literal in source.
 */
export function v2Rules(config: {
  id: string;
  label: string;
  url: string;
  views: { id: string }[];
}): ScanRule[] {
  const rules: ScanRule[] = [
    { rule: "V-2 url literal", pattern: new RegExp(escapeRe(config.url), "i") },
    { rule: "V-2 url host literal", pattern: new RegExp(escapeRe(new URL(config.url).host), "i") },
    { rule: "V-2 label literal", pattern: new RegExp(escapeRe(config.label)) },
    { rule: "V-2 provider id literal", pattern: new RegExp(`[\`'"]${escapeRe(config.id)}[\`'"]`) },
  ];
  for (const v of config.views)
    rules.push({ rule: `V-2 view id literal ${v.id}`, pattern: new RegExp(escapeRe(v.id)) });
  return rules;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Blank out comments (keeping line numbers) with the TypeScript scanner, so the scan reads code,
 * never prose: a doc comment saying "authorization server" is not an Authorization header, while
 * a string literal containing "//" (a URL) is still read whole.
 */
export function stripComments(text: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text
  );
  let out = "";
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const tokenText = scanner.getTokenText();
    const isComment =
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia;
    out += isComment ? tokenText.replace(/[^\n]/g, " ") : tokenText;
  }
  return out;
}

/** Scan every source file under dir. Refuses (throws) on a tree with no source file to read. */
export function scan(dir: string, rules: ScanRule[]): Finding[] {
  const files = tsFiles(dir);
  if (files.length === 0) throw new Error(`source scan: no source file under ${dir}`);
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((text, i) => {
      for (const { rule, pattern } of rules)
        if (pattern.test(text))
          findings.push({ rule, file: relative(dir, file), line: i + 1, text: text.trim() });
    });
  }
  return findings;
}
