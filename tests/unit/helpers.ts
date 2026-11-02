import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(__dirname, "..", "..");
export const CONFIG_PATH = join(ROOT, "extension.config.json");

export function readConfigJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

/** A fresh extension root in the OS temp dir holding the given config and the icon it names. */
export function tempExtensionRoot(config: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "vsx-ext-"));
  cpSync(join(ROOT, "media"), join(dir, "media"), { recursive: true });
  writeFileSync(join(dir, "extension.config.json"), JSON.stringify(config, null, 2));
  return dir;
}

/** A fake ExtensionContext: only the fields activate() reads. */
export function fakeContext(extensionPath: string) {
  return { extensionPath, subscriptions: [] as { dispose(): unknown }[] };
}
