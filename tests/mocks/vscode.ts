// Minimal stand-in for the `vscode` module, which exists only inside the extension host.
// It models exactly the API surface src/ uses; anything else is absent so a new use fails loudly.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { vi } from "vitest";

export class Uri {
  private constructor(
    private readonly value: string,
    readonly path: string
  ) {}
  static parse(value: string): Uri {
    const u = new URL(value);
    return new Uri(u.toString(), decodeURIComponent(u.pathname));
  }
  static file(path: string): Uri {
    return new Uri(`file://${path}`, path);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const path = join(base.path, ...segments);
    return base.value.startsWith("file://")
      ? Uri.file(path)
      : Uri.parse(new URL(path, base.value).toString());
  }
  get fsPath(): string {
    return this.path;
  }
  toString(): string {
    return this.value;
  }
}

export class McpHttpServerDefinition {
  readonly headers: Record<string, string>;
  constructor(
    readonly label: string,
    readonly uri: Uri,
    headers?: Record<string, string>,
    readonly version?: string
  ) {
    this.headers = headers ?? {};
  }
}

export class McpStdioServerDefinition {
  constructor(
    readonly label: string,
    readonly command: string
  ) {}
}

export const lm = {
  registerMcpServerDefinitionProvider: vi.fn((_id: string, _provider: unknown) => ({
    dispose: vi.fn(),
  })),
};

export const window = {
  registerWebviewViewProvider: vi.fn((_id: string, _provider: unknown) => ({
    dispose: vi.fn(),
  })),
};

/** The editor's display language; tests set it to exercise the French path. */
export const env = { language: "en" };

// Like VS Code: the message is its own key; a non-English display language reads
// l10n/bundle.l10n.<lang>.json from the extension root and falls back to the message.
const ROOT = resolve(__dirname, "..", "..");
export const l10n = {
  t: vi.fn((message: string, ...args: unknown[]): string => {
    let out = message;
    if (env.language !== "en") {
      const bundle = JSON.parse(
        readFileSync(join(ROOT, "l10n", `bundle.l10n.${env.language}.json`), "utf8")
      ) as Record<string, string>;
      out = bundle[message] ?? message;
    }
    return out.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)]));
  }),
};
