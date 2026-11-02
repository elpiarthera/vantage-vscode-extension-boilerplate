---
section: Fixed
---
- The extension's `displayName` and `description` go through `package.nls.json` / `package.nls.fr.json` (V-6). `extension.config.json` gains a required `description: { en, fr }`; `manifest-sync` writes `%extension.displayName%` / `%extension.description%` into `package.json` and the values into both nls files, and the build refuses drift. A test refuses any user-facing manifest string that is a literal or a key missing from either language.
