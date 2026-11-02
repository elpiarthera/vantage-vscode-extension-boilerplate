import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The ONE configuration file (V-2). Everything that identifies the server lives there; the
 * source reads it and holds no literal of it. A new server is a new file, never a code change.
 */
export const CONFIG_FILE_NAME = "extension.config.json";

/** Top-level keys a configuration file must carry. The single list the loader checks. */
export const REQUIRED_KEYS = [
  "id",
  "label",
  "publisher",
  "url",
  "icon",
  "distribution",
  "views",
] as const;

/** The view kinds the panel can render. The single list the loader checks and the panel switches on. */
export const VIEW_KINDS = ["tasks", "messages", "memory"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/** The languages every user-facing string ships in (V-6). */
export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

export interface ViewConfig {
  /** Webview view id, contributed in package.json and registered at activation. */
  id: string;
  /** View title, one per language. */
  title: Record<Language, string>;
  /** What the view renders. */
  kind: ViewKind;
}

const VIEW_KEYS = ["id", "title", "kind"] as const;

export interface ExtensionConfig {
  /** MCP server definition provider id, contributed in package.json and registered at activation. */
  id: string;
  /** Human-readable server name shown by VS Code. */
  label: string;
  /** Marketplace publisher id (copied into package.json by `npm run manifest:write`). */
  publisher: string;
  /** Streamable HTTP endpoint of the remote MCP server. */
  url: string;
  /** Path to the extension icon, relative to the configuration file. */
  icon: string;
  /** Target hosts (mcp-server-standard S-45); an extension config must include "vscode". */
  distribution: { targets: string[] };
  /** Panel views, in display order; an empty list means no panel. */
  views: ViewConfig[];
}

export class ConfigError extends Error {
  constructor(file: string, detail: string) {
    super(`${file}: ${detail}`);
    this.name = "ConfigError";
  }
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Same pattern vsce applies to a publisher id.
const PUBLISHER_RE = /^[a-z0-9][a-z0-9-]*$/i;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Read, validate and return the configuration. Throws a ConfigError naming the first defect. */
export function loadConfig(file: string): ExtensionConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError(file, `cannot read a JSON configuration (${(e as Error).message})`);
  }
  return validateConfig(raw, file);
}

export function validateConfig(raw: unknown, file: string): ExtensionConfig {
  const fail = (detail: string): never => {
    throw new ConfigError(file, detail);
  };
  if (!isObject(raw)) return fail("the configuration must be a JSON object");

  for (const key of REQUIRED_KEYS) if (!(key in raw)) fail(`missing required key "${key}"`);
  const known = new Set<string>(REQUIRED_KEYS);
  for (const key of Object.keys(raw)) if (!known.has(key)) fail(`unknown key "${key}"`);

  const str = (key: string, re?: RegExp, hint?: string): string => {
    const v = raw[key];
    if (typeof v !== "string" || v.trim() === "" || (re && !re.test(v)))
      fail(`"${key}" must be ${hint ?? "a non-empty string"}`);
    return v as string;
  };

  const id = str("id", ID_RE, "an identifier (letters, digits, '.', '_', '-')");
  const label = str("label");
  const publisher = str(
    "publisher",
    PUBLISHER_RE,
    "a Marketplace publisher id (letters, digits, '-')"
  );
  const url = str("url");
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    fail(`"url" must be an absolute URL, got ${JSON.stringify(url)}`);
  }
  const u = parsed as URL;
  if (!(u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname))))
    fail(`"url" must be https (plain http only on a loopback host), got ${JSON.stringify(url)}`);
  if (u.username || u.password) fail(`"url" must not carry credentials`);

  const icon = str("icon");
  if (!existsSync(resolve(dirname(file), icon)))
    fail(`"icon" ${JSON.stringify(icon)} does not exist next to the configuration file`);

  const distribution = raw.distribution;
  if (!isObject(distribution)) return fail(`"distribution" must be an object`);
  if (!("targets" in distribution)) fail(`missing required key "distribution.targets"`);
  const targets = distribution.targets;
  if (
    !Array.isArray(targets) ||
    targets.length === 0 ||
    !targets.every((t) => typeof t === "string" && t !== "")
  )
    fail(`"distribution.targets" must be a non-empty array of host names`);
  if (!(targets as string[]).includes("vscode"))
    fail(`"distribution.targets" must include "vscode"`);

  const views = raw.views;
  if (!Array.isArray(views)) return fail(`"views" must be an array`);
  const seen = new Map<string, number>();
  const parsedViews = views.map((v, i): ViewConfig => {
    const at = `views[${i}]`;
    if (!isObject(v)) return fail(`"${at}" must be an object`);
    for (const key of VIEW_KEYS) if (!(key in v)) fail(`missing required key "${at}.${key}"`);
    for (const key of Object.keys(v))
      if (!(VIEW_KEYS as readonly string[]).includes(key)) fail(`unknown key "${at}.${key}"`);
    if (typeof v.id !== "string" || !ID_RE.test(v.id)) fail(`"${at}.id" must be an identifier`);
    const id = v.id as string;
    const first = seen.get(id);
    if (first !== undefined)
      fail(`"${at}.id" ${JSON.stringify(id)} is already used by views[${first}]`);
    seen.set(id, i);
    if (!(VIEW_KINDS as readonly unknown[]).includes(v.kind))
      fail(
        `"${at}.kind" ${JSON.stringify(v.kind)} is not a supported view kind (${VIEW_KINDS.join(", ")})`
      );
    const title = v.title;
    if (!isObject(title))
      return fail(`"${at}.title" must be an object with ${LANGUAGES.join(", ")}`);
    for (const lang of LANGUAGES)
      if (!(lang in title)) fail(`missing required key "${at}.title.${lang}"`);
    for (const key of Object.keys(title))
      if (!(LANGUAGES as readonly string[]).includes(key)) fail(`unknown key "${at}.title.${key}"`);
    for (const lang of LANGUAGES) {
      const t = title[lang];
      if (typeof t !== "string" || t.trim() === "")
        fail(`"${at}.title.${lang}" must be a non-empty string`);
    }
    return {
      id,
      kind: v.kind as ViewKind,
      title: Object.fromEntries(LANGUAGES.map((l) => [l, title[l] as string])) as Record<
        Language,
        string
      >,
    };
  });

  return {
    id,
    label,
    publisher,
    url,
    icon,
    distribution: { targets: [...(targets as string[])] },
    views: parsedViews,
  };
}

/**
 * The activity-bar container that holds the panel views, derived from the provider id
 * (a container id admits letters, digits, '-' and '_' only).
 */
export function panelContainerId(config: Pick<ExtensionConfig, "id">): string {
  return `${config.id.replace(/[^A-Za-z0-9_-]/g, "-")}-panel`;
}

/** package.nls key of the container title. */
export const PANEL_TITLE_NLS_KEY = "panel.title";

/** package.nls key of a view's title. */
export function viewTitleNlsKey(viewId: string): string {
  return `panel.view.${viewId}.title`;
}

/** True for an nls key the panel owns (its title or a view title), whether or not a view uses it. */
export function isPanelNlsKey(key: string): boolean {
  return key === PANEL_TITLE_NLS_KEY || /^panel\.view\..+\.title$/.test(key);
}

/** The configured language matching an editor display language (`fr`, `fr-ca`, ...); English otherwise. */
export function pickLanguage(displayLanguage: string): Language {
  const base = displayLanguage.toLowerCase().split("-")[0];
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : "en";
}
