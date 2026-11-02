# changelog.d — one fragment per pull request

Add ONE new file here per PR, named after its branch (`changelog.d/<branch>.md`). Never edit
`CHANGELOG.md`: its `## [Unreleased]` block stays empty, and `npm run changelog:check` (run by `npm test`)
refuses an entry written there. At release, `npm run changelog:release -- --version <x.y.z>` folds every
fragment into a `## [x.y.z] - <date>` section right below `## [Unreleased]`, grouped by section, and deletes
the folded fragments.

```markdown
---
section: Fixed
---
- What changed and why, in one entry.
```

`section` is one of the Keep a Changelog sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
`Security`. A fragment without frontmatter, with another section, or with an empty body is refused (exit 2,
naming the file).

Why: when every PR edited the same `## [Unreleased]` block, each merge made every other open PR conflict on
`CHANGELOG.md` and need a rebase. Two PRs adding two different files never conflict. This README is ignored by
the assembler. Source of the mechanism: elpiarthera/vantage-mcp-boilerplate `scripts/changelog-assemble.mjs` (from elpiarthera/mcp-doctor).
