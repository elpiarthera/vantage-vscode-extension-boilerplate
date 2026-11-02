# vantage-vscode-extension-boilerplate

VS Code extension boilerplate: installs one remote MCP server into VS Code from **one configuration
file**. Built against the VS Code extension standard (ElPi-Corp
`resources/references/vscode-extension-standard.md` @3c617982), rules V-1, V-2, V-3, V-5, V-6 and V-12 so far.

*Version française plus bas : [Français](#français).*

## English

### Quick start

```sh
npx vantage-vscode-extension-boilerplate my-extension
cd my-extension
# edit extension.config.json: one file = one server (id, label, description, publisher, url, icon, views)
npm install
npm run manifest:write
npm run build
npx @vscode/vsce package
```

`npx` creates `my-extension/` (the directory name becomes the package `name`: lowercase letters,
digits and hyphens) with version `0.1.0`, an empty changelog and its own `.gitignore` and
`package-lock.json`; it refuses a directory that already holds files. `npm install` comes before
`npm run manifest:write`, which compiles the configuration loader with `tsc`. The created
`package.json` carries no `repository`, `homepage` or `bugs`: add your own before publishing, so
your listing points at your project, not at this boilerplate. The last command
produces `my-extension-0.1.0.vsix`, installable with *Extensions: Install from VSIX…*.
Marketplace publication is a later step, parked for now.

### One configuration file = one server

Everything that identifies the server lives in `extension.config.json`:

| Key | Meaning |
|---|---|
| `id` | MCP server definition provider id (contributed in `package.json`, registered at activation) |
| `label` | Server name shown by VS Code (also the extension's display name, a proper noun: the same in every language) |
| `description` | The extension's description, one per language: `{ en, fr }` |
| `publisher` | Marketplace publisher id |
| `url` | Streamable HTTP endpoint of the remote MCP server (`https`; plain `http` only on a loopback host) |
| `icon` | Extension icon, relative to the configuration file |
| `distribution.targets` | Target hosts (mcp-server-standard S-45); must include `"vscode"` |
| `views` | Panel views, in display order: `{ id, title: { en, fr }, kind }` (see [The panel](#the-panel)) |

The source (`src/`) holds no literal of these values. When VS Code activates the extension, it reads
the file, registers `vscode.lm.registerMcpServerDefinitionProvider(<id>, …)` and provides one
`vscode.McpHttpServerDefinition(<label>, <url>)`. A missing, unknown or malformed key refuses
activation (and the build), naming the key.

### The panel

The extension adds an activity-bar container (titled with the server `label`) holding one webview
view per entry of `views`:

```json
"views": [
  { "id": "vantage-mcp.tasks", "title": { "en": "Tasks", "fr": "Tâches" }, "kind": "tasks" }
]
```

- `id`: the webview view id (letters, digits, `.`, `_`, `-`), unique.
- `title`: the view title in every language the extension ships (`en`, `fr`); both are required.
- `kind`: what the view renders. Supported kinds: `tasks`, `messages`, `memory`.

**Add or remove a view: edit `extension.config.json` only**, then `npm run manifest:write`. That
script writes the container, the views and their `onView:` activation events into `package.json`,
and the titles into `package.nls.json` (EN) and `package.nls.fr.json` (FR); `npm run build` refuses
any drift, naming the field or the key. The extension registers exactly the configured ids; no
source file names a view id (the source scan refuses one). The loader refuses an unknown kind, a
missing title language or a duplicated id, naming it.

**The three views are placeholders for now.** Each shows an empty state ("No tasks to show yet.")
in the editor's language. Wiring them to the MCP server's data is the next task; a new kind is a
code change (its texts must exist in both languages or the source does not compile).

What every panel page guarantees (V-5, V-6, V-12):

- **Nothing remote.** A Content-Security-Policy `default-src 'none'; style-src <webview.cspSource>;
  script-src 'nonce-<fresh per render>'`; every asset is one of the extension's own files, minted by
  `webview.asWebviewUri`; no inline style, no inline handler. A unit test reads the generated HTML
  and refuses any other source, any URL the host did not mint, any script without the nonce.
- **The editor's theme.** Styles come from the `@vantageos/mosaic` design tokens
  (`@vantageos/mosaic-tokens`, copied into `out/webview/` at build), whose colour slots are mapped
  onto VS Code's theme variables (`--vscode-*`), so the panel follows light, dark and high-contrast
  themes; the panel stylesheet holds no colour of its own (a test refuses one).
- **The editor's language.** Texts go through `vscode.l10n` (`l10n/bundle.l10n.json` and
  `bundle.l10n.fr.json`) and view titles through `package.nls*.json`; the page never reads the
  locale, the extension passes the strings in. A test refuses a key missing in either language.
- **Text first.** The page is plain HTML that reads without its script; the only script maps the
  editor's theme kind onto the token theme.
- **Accessible.** axe-core runs on every view's page with the light and the dark token sets:
  0 serious or critical violations (colour contrast is reported "incomplete" in jsdom, which has no
  layout engine; contrast comes from the active VS Code theme).

Why the tokens and not mosaic's display components: `@vantageos/mosaic`'s display components
(`EmptyState`, ...) style themselves with Tailwind utility classes in a fixed palette
(`text-slate-900`, `bg-white`), not with the tokens. In a webview they would need a Tailwind build,
and they would not follow a dark or high-contrast theme. The panel reuses their structure (a section
labelled by its heading, a heading, a body) and the tokens, until mosaic ships token-styled display
components.

### Fork it for another server

1. Edit `extension.config.json` only (and replace `media/icon.png` if you want).
2. `npm run manifest:write` copies the derived fields into `package.json` and the view titles into
   `package.nls*.json`.
3. `npm ci && npm test && npm run lint`.

No code change. A second configuration file gives a second server; the unit tests prove it.

**Declared exception: `package.json` carries copies.** VS Code and `vsce` read `package.json`
statically, so `publisher`, `displayName`, `description`, `icon`, `activationEvents`, `l10n`,
`contributes.mcpServerDefinitionProviders`, `contributes.viewsContainers` and `contributes.views`
must be present there. Every user-facing one (`displayName`, `description`, the container and view
titles) is a `%key%` whose English and French values live in `package.nls.json` and
`package.nls.fr.json` (V-6); a test refuses any literal. They are derived from
`extension.config.json` by `scripts/manifest-sync.mjs`, and `npm run build` refuses any difference,
naming the field. You never edit them by hand.

### Sign-in

The extension asks for nothing and holds no credential. When VS Code starts the server, VS Code's own
MCP sign-in (OAuth) runs against the server's authorization server: the browser opens, you sign in to
the server, and VS Code keeps the session. The extension never sees, stores, logs or forwards a token
(V-3). A fork whose server needs another input asks for it when the server starts, never at
activation, and keeps it in VS Code's SecretStorage (V-4).

### Data

The extension stores nothing: no setting, no state, no secret, no file. It sends nothing anywhere
except through VS Code to the configured MCP server, and it has no telemetry (V-7). What the server
reads and writes is the server's own: it is stated in the server's documentation, and a fork states
it here, under this heading, before publishing.

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
| `npm run build` | `tsc` to `out/`, copies the mosaic tokens to `out/webview/`, then checks `package.json` and `package.nls*.json` against `extension.config.json` |
| `npm test` | build, `changelog:check`, unit tests (vitest, mocked `vscode`) |
| `npm run test:integration` | launches VS Code (the `engines.vscode` floor) with the extension, asserts the server definition and opens the panel (each configured view receives its HTML, an unconfigured id does not exist); needs a display (`xvfb-run -a` on Linux) or `VSCODE_TEST_HEADLESS=1` (Electron headless platform) |
| `npm run lint` | Biome |
| `npm run typecheck` | `tsc --noEmit` on the extension and the integration suite |
| `npm run manifest:write` | rewrite the derived `package.json` fields from the configuration |
| `npm run test:pack` | boilerplate only: packs the npm tarball, creates a project from it with `npx`, then runs `npm ci`, build, tests, lint, typecheck, `vsce ls` and `vsce package` in it (slow, network) |

### Changelog

One fragment per pull request in `changelog.d/` (see `changelog.d/README.md`); `CHANGELOG.md`'s
`## [Unreleased]` block stays empty and `npm test` refuses an entry written there.

### Release (this boilerplate)

Two allowlists, independent on purpose:

- `.vscodeignore` says what the **extension** ships in its `.vsix` (V-8): the compiled bundle, the
  panel assets, the configuration, nls and l10n files, the icon, README, LICENSE, CHANGELOG.
- `bin/template-files.json` says what a **new project** receives from `npx`. `bin/create.mjs` copies
  exactly those paths; `.npmignore`, the npm tarball allowlist, is rendered from the same list
  (`node bin/template-prepare.mjs --npmignore`) and a unit test refuses any difference. npm's `files`
  field is not used: `vsce` refuses a `files` field next to a `.vscodeignore`.

`npm run test:pack` is the proof that the list is complete. At release:
`npm run changelog:release -- --version <x.y.z> --date <YYYY-MM-DD>` folds the fragments, then add the
`[x.y.z]: https://www.npmjs.com/package/vantage-vscode-extension-boilerplate/v/x.y.z` link line at the
bottom of `CHANGELOG.md`.

### Not there yet

- Panel data: the views show placeholders; wiring them to the MCP server's data is the next task.
- Marketplace publication (listing, federated-identity CI publish, version gate): parked. Packaging
  works: `npx @vscode/vsce package` builds the `.vsix` from the `.vscodeignore` allowlist.
- The package `name` is `vantage-vscode-extension-boilerplate`, unscoped, for npm and for the extension id: `vsce` refuses a scoped name.

## Français

### Démarrage rapide

```sh
npx vantage-vscode-extension-boilerplate mon-extension
cd mon-extension
# modifier extension.config.json : un fichier = un serveur (id, label, description, publisher, url, icon, views)
npm install
npm run manifest:write
npm run build
npx @vscode/vsce package
```

`npx` crée `mon-extension/` (le nom du dossier devient le `name` du paquet : minuscules, chiffres et
tirets) en version `0.1.0`, avec un changelog vide et ses propres `.gitignore` et
`package-lock.json` ; il refuse un dossier qui contient déjà des fichiers. `npm install` passe avant
`npm run manifest:write`, qui compile le chargeur de configuration avec `tsc`. Le `package.json`
créé ne porte ni `repository`, ni `homepage`, ni `bugs` : ajoutez les vôtres avant de publier, pour
que la fiche pointe vers votre projet et non vers ce boilerplate. La dernière commande
produit `mon-extension-0.1.0.vsix`, installable par *Extensions : Installer à partir d'un VSIX…*.
La publication sur la Marketplace est une étape ultérieure, en attente pour l'instant.

### Un fichier de configuration = un serveur

Tout ce qui identifie le serveur vit dans `extension.config.json` : `id` (identifiant du fournisseur
de définitions MCP, contribué dans `package.json` et enregistré à l'activation), `label` (nom du
serveur affiché par VS Code), `description` (description de l'extension, une par langue :
`{ en, fr }`), `publisher` (identifiant d'éditeur Marketplace), `url` (point d'accès
Streamable HTTP du serveur distant, `https` ; `http` seulement sur une adresse locale), `icon`,
`distribution.targets` (hôtes cibles, S-45, doit contenir `"vscode"`) et `views` (vues du panneau,
dans l'ordre d'affichage : `{ id, title: { en, fr }, kind }`, voir [Le panneau](#le-panneau)).

La source (`src/`) ne contient aucune de ces valeurs en dur. À l'activation, l'extension lit le
fichier, appelle `vscode.lm.registerMcpServerDefinitionProvider(<id>, …)` et fournit une
`vscode.McpHttpServerDefinition(<label>, <url>)`. Une clé absente, inconnue ou mal formée refuse
l'activation (et le build) en la nommant.

### Le panneau

L'extension ajoute un conteneur dans la barre d'activité (titré avec le `label` du serveur) qui
contient une vue webview par entrée de `views` : `id` (identifiant unique de la vue), `title`
(le titre dans chaque langue livrée, `en` et `fr`, les deux obligatoires) et `kind` (ce que la vue
affiche : `tasks`, `messages` ou `memory`).

**Ajouter ou retirer une vue : modifier seulement `extension.config.json`**, puis
`npm run manifest:write`. Ce script écrit le conteneur, les vues et leurs événements d'activation
`onView:` dans `package.json`, et les titres dans `package.nls.json` (EN) et `package.nls.fr.json`
(FR) ; `npm run build` refuse tout écart en nommant le champ ou la clé. L'extension enregistre
exactement les ids configurés ; aucun fichier source ne nomme un id de vue (le scan de la source le
refuse). Le chargeur refuse un `kind` inconnu, une langue de titre manquante ou un id en double, en
le nommant.

**Les trois vues sont pour l'instant des emplacements vides.** Chacune affiche un état vide
(« Aucune tâche à afficher pour l'instant. ») dans la langue de l'éditeur. Les relier aux données
du serveur MCP est la tâche suivante.

Ce que garantit chaque page du panneau (V-5, V-6, V-12) :

- **Rien de distant.** Une Content-Security-Policy `default-src 'none'; style-src
  <webview.cspSource>; script-src 'nonce-<nouveau à chaque rendu>'` ; chaque ressource est un
  fichier de l'extension, adressé par `webview.asWebviewUri` ; aucun style ni gestionnaire en ligne.
  Un test unitaire lit le HTML produit et refuse toute autre source, toute URL non fournie par
  l'hôte, tout script sans nonce.
- **Le thème de l'éditeur.** Les styles viennent des tokens de `@vantageos/mosaic`
  (`@vantageos/mosaic-tokens`, copiés dans `out/webview/` au build), dont les couleurs sont reliées
  aux variables de thème de VS Code (`--vscode-*`) : le panneau suit les thèmes clair, sombre et à
  contraste élevé ; la feuille de style du panneau ne contient aucune couleur propre (un test le
  refuse).
- **La langue de l'éditeur.** Les textes passent par `vscode.l10n` (`l10n/bundle.l10n.json` et
  `bundle.l10n.fr.json`) et les titres des vues par `package.nls*.json` ; la page ne lit jamais la
  langue, l'extension lui transmet les textes. Un test refuse une clé absente dans l'une des langues.
- **Le texte d'abord.** La page est du HTML lisible sans son script ; le seul script relie le type
  de thème de l'éditeur au thème des tokens.
- **Accessible.** axe-core tourne sur la page de chaque vue avec les tokens clairs et sombres :
  0 violation sérieuse ou critique (le contraste est rapporté « incomplet » sous jsdom, qui n'a pas
  de moteur de mise en page ; il dépend du thème VS Code actif).

Pourquoi les tokens et pas les composants d'affichage de mosaic : ceux de `@vantageos/mosaic`
(`EmptyState`, ...) se stylent avec des classes Tailwind dans une palette fixe (`text-slate-900`,
`bg-white`), pas avec les tokens. Dans une webview, ils exigeraient un build Tailwind et ne
suivraient ni le thème sombre ni le contraste élevé. Le panneau reprend leur structure et les
tokens, en attendant des composants d'affichage stylés par les tokens.

### Forker pour un autre serveur

1. Modifier seulement `extension.config.json` (et `media/icon.png` si besoin).
2. `npm run manifest:write` recopie les champs dérivés dans `package.json` et les titres des vues
   dans `package.nls*.json`.
3. `npm ci && npm test && npm run lint`.

Aucun changement de code. Un second fichier de configuration donne un second serveur ; les tests
unitaires le prouvent.

**Exception déclarée : `package.json` porte des copies.** VS Code et `vsce` lisent `package.json`
de façon statique : `publisher`, `displayName`, `description`, `icon`, `activationEvents` et
`contributes.mcpServerDefinitionProviders` doivent y figurer. Chaque texte visible par
l'utilisateur (`displayName`, `description`, les titres du conteneur et des vues) y est une clé
`%clé%` dont les valeurs anglaise et française vivent dans `package.nls.json` et
`package.nls.fr.json` (V-6) ; un test refuse tout texte en clair. Ils sont dérivés de
`extension.config.json` par `scripts/manifest-sync.mjs`, et `npm run build` refuse tout écart en
nommant le champ. On ne les modifie jamais à la main.

### Connexion

L'extension ne demande rien et ne détient aucun identifiant. Quand VS Code démarre le serveur, la
connexion MCP de VS Code (OAuth) passe par le serveur d'autorisation du serveur : le navigateur
s'ouvre, vous vous connectez au serveur, et VS Code garde la session. L'extension ne voit, ne stocke,
ne journalise ni ne transmet aucun jeton (V-3). Un fork dont le serveur exige une autre saisie la
demande au démarrage du serveur, jamais à l'activation, et la garde dans le SecretStorage de VS Code
(V-4).

### Données

L'extension ne stocke rien : ni réglage, ni état, ni secret, ni fichier. Elle n'envoie rien ailleurs
qu'au serveur MCP configuré, via VS Code, et n'a aucune télémétrie (V-7). Ce que le serveur lit et
écrit relève du serveur : sa documentation le dit, et un fork le dit ici, sous ce titre, avant de
publier.

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
`npm run manifest:write`, et pour ce boilerplate seulement `npm run test:pack` (crée un projet depuis
le paquet npm et y lance installation, build, tests, lint, typecheck et `vsce package` ; lent, réseau).

### Changelog

Un fragment par pull request dans `changelog.d/` ; le bloc `## [Unreleased]` de `CHANGELOG.md`
reste vide.

### Publication (ce boilerplate)

Deux listes blanches, indépendantes à dessein :

- `.vscodeignore` dit ce que l'**extension** livre dans son `.vsix` (V-8) : le bundle compilé, les
  fichiers du panneau, la configuration, les fichiers nls et l10n, l'icône, README, LICENSE, CHANGELOG.
- `bin/template-files.json` dit ce qu'un **nouveau projet** reçoit de `npx`. `bin/create.mjs` copie
  exactement ces chemins ; `.npmignore`, la liste blanche du paquet npm, est générée depuis la même
  liste (`node bin/template-prepare.mjs --npmignore`) et un test unitaire refuse tout écart. Le champ
  `files` de npm n'est pas utilisé : `vsce` refuse un champ `files` à côté d'un `.vscodeignore`.

`npm run test:pack` prouve que la liste est complète. À la publication :
`npm run changelog:release -- --version <x.y.z> --date <AAAA-MM-JJ>` regroupe les fragments, puis
ajouter la ligne de lien `[x.y.z]: https://www.npmjs.com/package/vantage-vscode-extension-boilerplate/v/x.y.z`
en bas de `CHANGELOG.md`.

### Pas encore là

- Les données du panneau : les vues affichent des emplacements vides ; les relier aux données du
  serveur MCP est la tâche suivante.
- La publication sur la Marketplace (fiche, publication CI par identité fédérée, contrôle de
  version) : en attente. Le paquet fonctionne : `npx @vscode/vsce package` construit le `.vsix` depuis
  la liste blanche `.vscodeignore`.
- Le `name` du paquet est `vantage-vscode-extension-boilerplate`, non scopé, pour npm comme pour l'identifiant de l'extension : `vsce` refuse un nom scopé.