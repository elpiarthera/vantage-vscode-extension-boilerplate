# Changelog

All notable changes to `vantage-vscode-extension-boilerplate` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Entries are written as one fragment per pull request in `changelog.d/` and folded in at release
(`npm run changelog:release -- --version <x.y.z>`); `## [Unreleased]` stays empty.

## [Unreleased]

## [0.1.0] - 2026-11-02

### Added
- **Extension skeleton: one configuration file = one MCP server.** `extension.config.json` holds the provider id, label, publisher, Streamable HTTP URL, icon, `distribution.targets` and `views`; a typed loader refuses a missing, unknown or malformed key, naming it. At activation the extension registers `vscode.lm.registerMcpServerDefinitionProvider` under the configured id and provides one `McpHttpServerDefinition` for the configured URL, with no header (authentication is VS Code's MCP OAuth). `package.json`'s publisher, display name, icon, activation event and contributed provider are derived from the configuration (`npm run manifest:write`) and `npm run build` refuses a difference. `engines.vscode` is `^1.101.0`, the first `@types/vscode` release carrying the stable MCP provider API. Unit tests (mocked `vscode`), a source scan for V-1/V-2/V-3 with one positive control per form, an extension-host test (`npm run test:integration`) and a CI workflow.
- **Side panel from the configuration.** `views` in `extension.config.json` is now a typed list `{ id, title: { en, fr }, kind }` (kinds: `tasks`, `messages`, `memory`); the loader refuses an unknown kind, a missing title language, an unknown key or a duplicated id, naming it. The boilerplate ships the three views as placeholders (empty states; data wiring to the MCP server is the next task). `scripts/manifest-sync.mjs` derives an activity-bar container, one webview view per configured view, their `onView:` activation events and `l10n` into `package.json`, and the titles into `package.nls.json` / `package.nls.fr.json`; `npm run build` refuses drift. One `WebviewViewProvider` per view, registered under its configured id; each page has a `default-src 'none'` CSP with a per-render script nonce, loads only the extension's own files through `asWebviewUri`, takes its styles from `@vantageos/mosaic-tokens` mapped onto VS Code theme variables (light, dark, high contrast) and its texts from `vscode.l10n` (EN + FR bundles). Tests: registration from the config, HTML contract with one positive control per form, l10n and nls parity, panel CSS colour whitelist, source scan on every configured view id, axe-core on light and dark token sets, and an extension-host test that opens the panel.
- **`npx vantage-vscode-extension-boilerplate <dir>` creates a new extension project.** `bin/create.mjs` copies exactly the paths of `bin/template-files.json`, restores `.gitignore` and `package-lock.json`, names the project after the directory (refusing a name npm or vsce would refuse), resets the version to 0.1.0 and the changelog to an empty `## [Unreleased]`, drops the boilerplate-only `bin`, scripts and fragments, and refuses a non-empty directory (exit 2, named). The npm tarball allowlist `.npmignore` is rendered from the same list and a unit test refuses drift; `.vscodeignore` stays the separate `.vsix` allowlist (vsce refuses a `files` field next to it). `npm run test:pack` packs the tarball, creates a project with `npx` and runs `npm ci`, build, tests, lint, typecheck, `vsce ls` and `vsce package` in it. README: Quick start in English and French.

### Fixed
- The V-3 source scan refuses a credential written through an aliased state object (`const st = context.workspaceState; st.update(k, refreshToken)`): the state rule now reads any `.update(...)` call's arguments, whatever the receiver.
- The extension's `displayName` and `description` go through `package.nls.json` / `package.nls.fr.json` (V-6). `extension.config.json` gains a required `description: { en, fr }`; `manifest-sync` writes `%extension.displayName%` / `%extension.description%` into `package.json` and the values into both nls files, and the build refuses drift. A test refuses any user-facing manifest string that is a literal or a key missing from either language.

[0.1.0]: https://www.npmjs.com/package/vantage-vscode-extension-boilerplate/v/0.1.0
