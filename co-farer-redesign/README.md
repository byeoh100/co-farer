# Co-farer redesign: hand-off for Claude Code

Start with `SPEC.md`. It is the source of truth.

- `SPEC.md`: what to build, the ground rules, build order and acceptance checklist.
- `assets/favicon.svg`: tab icon. Copy it to `public/favicon.svg` unchanged.
- `assets/logo-mark.svg`: header logo mark (same artwork). Copy it to `public/` unchanged.
- `design-reference/`: the mockups as design-tool source, for exact values. See its README.

Suggested prompt:

> Read `co-farer-redesign/README.md` and `SPEC.md`. Work through the build order one commit at a time on a new branch off `main`, follow the ground rules, and stop to ask before breaking any of them. Finish with the acceptance checklist and open a PR. Don't deploy.
