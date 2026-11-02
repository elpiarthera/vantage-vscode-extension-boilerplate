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

export interface ViewConfig {
  id: string;
}

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
  /** Panel views (filled by a later task); each carries an id. */
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
  views.forEach((v, i) => {
    if (!isObject(v) || typeof v.id !== "string" || !ID_RE.test(v.id))
      fail(`"views[${i}].id" must be an identifier`);
  });

  return {
    id,
    label,
    publisher,
    url,
    icon,
    distribution: { targets: [...(targets as string[])] },
    views: (views as { id: string }[]).map((v) => ({ id: v.id })),
  };
}
