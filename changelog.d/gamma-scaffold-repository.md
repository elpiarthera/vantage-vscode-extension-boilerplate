---
section: Changed
---
- **The scaffold carries the new project's repository.** `npx vantage-vscode-extension-boilerplate <dir> --repository <url>` writes `"repository": {"type":"git","url":"<url>"}` (`https:`, `git+https:`, `git+ssh:` or `ssh:`; before or after `<dir>`; a malformed URL, a URL naming the boilerplate and an unknown flag are refused, exit 2, named). Without the flag the scaffold writes the machine placeholder `urn:vantage:todo:repository` (exported as `REPOSITORY_TODO_MARKER`) and the next steps say to set it; `homepage` and `bugs` stay dropped. The pack end-to-end asserts the placeholder and that `vsce package` still succeeds with it. (README: #quick-start)
