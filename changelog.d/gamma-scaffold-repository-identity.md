---
section: Fixed
---
- A project created by `npx vantage-vscode-extension-boilerplate <dir>` no longer inherits the boilerplate's `repository` (nor `homepage` / `bugs`): its Marketplace listing and npm page would have pointed at the boilerplate. The README tells the user to add their own. A unit test and the pack end-to-end both refuse any created `package.json` field naming the boilerplate.
