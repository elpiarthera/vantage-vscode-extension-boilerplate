#!/usr/bin/env node
/**
 * webview-assets — copy the mosaic design tokens into the extension's build output.
 *
 * The panel webview loads only the extension's own files (V-5: nothing remote), so the token
 * stylesheet of @vantageos/mosaic-tokens is copied, byte for byte, to out/webview/mosaic-tokens.css
 * at build (`npm run build`). It is never edited or committed here: the package is the single
 * source, pinned by the lockfile.
 *
 * Usage: node scripts/webview-assets.mjs   (run from the extension root)
 */
import { copyFileSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TOKENS_SPECIFIER = "@vantageos/mosaic-tokens/css";
export const TOKENS_TARGET = join("out", "webview", "mosaic-tokens.css");

export function main(argv, cwd = process.cwd()) {
  if (argv.length > 0) {
    console.error(`webview-assets: unknown argument ${argv[0]}`);
    return 1;
  }
  let source;
  try {
    source = createRequire(join(cwd, "package.json")).resolve(TOKENS_SPECIFIER);
  } catch (e) {
    console.error(`webview-assets: cannot resolve ${TOKENS_SPECIFIER} (${e.message}) — run npm ci`);
    return 2;
  }
  const target = join(cwd, TOKENS_TARGET);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`webview-assets: ${TOKENS_SPECIFIER} -> ${TOKENS_TARGET}`);
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
