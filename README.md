# vantage-vscode-extension-boilerplate

VS Code extension boilerplate: installs one remote MCP server into VS Code from **one configuration
file**. Built against the VS Code extension standard (ElPi-Corp
`resources/references/vscode-extension-standard.md` @3c617982), rules V-1 to V-3 so far.

*Version française plus bas : [Français](#français).*

## English

### One configuration file = one server

Everything that identifies the server lives in `extension.config.json`:

| Key | Meaning |
|---|---|
| `id` | MCP server definition provider id (contributed in `package.json`, registered at activation) |
| `label` | Server name shown by VS Code (also the extension's display name) |
| `publisher` | Marketplace publisher id |
| `url` | Streamable HTTP endpoint of the remote MCP server (`https`; plain `http` only on a loopback host) |
| `icon` | Extension icon, relative to the configuration file |
| `distribution.targets` | Target hosts (mcp-server-standard S-45); must include `"vscode"` |
| `views` | Panel views, each with an `id` (empty for now) |

The source (`src/`) holds no literal of these values. When VS Code activates the extension, it reads
the file, registers `vscode.lm.registerMcpServerDefinitionProvider(<id>, …)` and provides one
`vscode.McpHttpServerDefinition(<label>, <url>)`. A missing, unknown or malformed key refuses
activation (and the build), naming the key.

### Fork it for another server

1. Edit `extension.config.json` only (and replace `media/icon.png` if you want).
2. `npm run manifest:write` copies the derived fields into `package.json`.
3. `npm ci && npm test && npm run lint`.

No code change. A second configuration file gives a second server; the unit tests prove it.

**Declared exception: `package.json` carries copies.** VS Code and `vsce` read `package.json`
statically, so `publisher`, `displayName`, `icon`, `activationEvents` and
`contributes.mcpServerDefinitionProviders` must be literals there. They are derived from
`extension.config.json` by `scripts/manifest-sync.mjs`, and `npm run build` refuses any difference,
naming the field. You never edit them by hand.

### What the rules guarantee

- **V-1, registration.** `package.json` contributes exactly one provider whose id is the configured
  id, and the extension registers that same id at activation (both derived from one file, checked
  at build and in tests). `engines.vscode` is `^1.101.0`: `@types/vscode@1.101.0` is the first
  release whose `index.d.ts` declares `lm.registerMcpServerDefinitionProvider` and
  `McpHttpServerDefinition` (1.100.0 declares neither). Activation is `onMcpCollection:<id>` only.
- **V-2, configuration, never code.** A source scan refuses the configured URL, its host, the label,
  the provider id and any view id written as a literal in `src/`.
- **V-3, Streamable HTTP, no token.** The provider returns an `McpHttpServerDefinition` with no
  header. Sign-in is VS Code's own MCP OAuth against the server's authorization server. The
  extension never reads, stores, logs or forwards a token; the source scan refuses `Authorization`,
  `Bearer`, `secrets.store/get`, a credential-shaped `globalState`/`workspaceState` key, a logged
  credential, and a stdio definition.
- **No telemetry.** The extension sends nothing anywhere; it has no runtime dependency.

### Scripts

| Command | What it does |
|---|---|
| `npm run build` | `tsc` to `out/`, then checks `package.json` against `extension.config.json` |
| `npm test` | build, `changelog:check`, unit tests (vitest, mocked `vscode`) |
| `npm run test:integration` | launches VS Code (the `engines.vscode` floor) with the extension and asserts the server definition; needs a display (`xvfb-run -a` on Linux) or `VSCODE_TEST_HEADLESS=1` (Electron headless platform) |
| `npm run lint` | Biome |
| `npm run typecheck` | `tsc --noEmit` on the extension and the integration suite |
| `npm run manifest:write` | rewrite the derived `package.json` fields from the configuration |

### Changelog

One fragment per pull request in `changelog.d/` (see `changelog.d/README.md`); `CHANGELOG.md`'s
`## [Unreleased]` block stays empty and `npm test` refuses an entry written there.

### Not there yet

- The panel next to the chat (views, webview, bilingual strings): a later task.
- Packaging and publication (Marketplace listing, federated-identity CI publish, version gate): a
  later task. `.vscodeignore` is already an allowlist (`out/*.js`, the configuration, the icon,
  README, LICENSE, CHANGELOG).
- The package `name` is scoped (`@vantageos/…`), which `vsce` refuses for a VS Code extension;
  to be settled before packaging.

## Français

### Un fichier de configuration = un serveur

Tout ce qui identifie le serveur vit dans `extension.config.json` : `id` (identifiant du fournisseur
de définitions MCP, contribué dans `package.json` et enregistré à l'activation), `label` (nom du
serveur affiché par VS Code), `publisher` (identifiant d'éditeur Marketplace), `url` (point d'accès
Streamable HTTP du serveur distant, `https` ; `http` seulement sur une adresse locale), `icon`,
`distribution.targets` (hôtes cibles, S-45, doit contenir `"vscode"`) et `views` (vues du panneau,
vide pour l'instant).

La source (`src/`) ne contient aucune de ces valeurs en dur. À l'activation, l'extension lit le
fichier, appelle `vscode.lm.registerMcpServerDefinitionProvider(<id>, …)` et fournit une
`vscode.McpHttpServerDefinition(<label>, <url>)`. Une clé absente, inconnue ou mal formée refuse
l'activation (et le build) en la nommant.

### Forker pour un autre serveur

1. Modifier seulement `extension.config.json` (et `media/icon.png` si besoin).
2. `npm run manifest:write` recopie les champs dérivés dans `package.json`.
3. `npm ci && npm test && npm run lint`.

Aucun changement de code. Un second fichier de configuration donne un second serveur ; les tests
unitaires le prouvent.

**Exception déclarée : `package.json` porte des copies.** VS Code et `vsce` lisent `package.json`
de façon statique : `publisher`, `displayName`, `icon`, `activationEvents` et
`contributes.mcpServerDefinitionProviders` doivent y figurer en clair. Ils sont dérivés de
`extension.config.json` par `scripts/manifest-sync.mjs`, et `npm run build` refuse tout écart en
nommant le champ. On ne les modifie jamais à la main.

### Ce que garantissent les règles

- **V-1, enregistrement.** `package.json` contribue un seul fournisseur dont l'id est celui de la
  configuration, et l'extension enregistre ce même id à l'activation. `engines.vscode` vaut
  `^1.101.0` : `@types/vscode@1.101.0` est la première version qui déclare
  `lm.registerMcpServerDefinitionProvider` et `McpHttpServerDefinition`. Activation sur
  `onMcpCollection:<id>` uniquement.
- **V-2, configuration et jamais code.** Un scan de la source refuse l'URL, son hôte, le nom, l'id
  du fournisseur et tout id de vue écrits en dur dans `src/`.
- **V-3, Streamable HTTP, aucun jeton.** Le fournisseur renvoie une `McpHttpServerDefinition` sans
  en-tête. La connexion passe par l'OAuth MCP de VS Code auprès du serveur d'autorisation du
  serveur. L'extension ne lit, ne stocke, ne journalise ni ne transmet aucun jeton.
- **Aucune télémétrie.** L'extension n'envoie rien ; elle n'a aucune dépendance d'exécution.

### Commandes

`npm run build` (compilation et contrôle de `package.json`), `npm test` (build, contrôle du
changelog, tests unitaires), `npm run test:integration` (lance VS Code avec l'extension ; nécessite
un affichage, `xvfb-run -a` sous Linux, ou `VSCODE_TEST_HEADLESS=1`), `npm run lint`, `npm run typecheck`,
`npm run manifest:write`.

### Changelog

Un fragment par pull request dans `changelog.d/` ; le bloc `## [Unreleased]` de `CHANGELOG.md`
reste vide.

### Pas encore là

- Le panneau à côté du chat (vues, webview, textes bilingues) : tâche suivante.
- Le paquet et la publication (fiche Marketplace, publication CI par identité fédérée, contrôle de
  version) : tâche suivante.
- Le `name` du paquet est scopé (`@vantageos/…`), ce que `vsce` refuse pour une extension VS Code ;
  à trancher avant le packaging.
