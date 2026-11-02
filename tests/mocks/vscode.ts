// Minimal stand-in for the `vscode` module, which exists only inside the extension host.
// It models exactly the API surface src/ uses; anything else is absent so a new use fails loudly.
import { vi } from "vitest";

export class Uri {
  private constructor(private readonly value: string) {}
  static parse(value: string): Uri {
    return new Uri(new URL(value).toString());
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
