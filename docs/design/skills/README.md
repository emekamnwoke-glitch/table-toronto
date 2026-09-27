# Design system references

All 67 style guides from [typeui.sh/awesome-design-skills](https://github.com/typeui-sh/awesome-design-skills)
(MIT licensed), kept here as reference material for frontend work —
starting with the merchant dashboard's still-undecided visual identity,
see the "Open / unresolved" note in
[`../../architecture/DECISIONS.md`](../../architecture/DECISIONS.md).

Each folder has a `SKILL.md` (tokens, component rules, accessibility
constraints — written for an AI agent to follow) and a `DESIGN.md`
(human-readable rationale). These are **not** wired up as invokable
Claude Code skills in this repo — they're plain reference files, read
before designing a screen rather than guessed at from a folder name.

## Starting points for the merchant dashboard

Reviewed as the strongest fits for a data-dense, glanceable tool a
restaurant manager checks mid-shift, on the React + Vite + Tailwind
stack already decided (ADR-0009):

| Folder | Why |
|---|---|
| `shadcn/` | Tailwind-native components — matches the stack directly |
| `ant/` | Built for data-dense admin/dashboard UIs |
| `enterprise/` | Dark-theme alternative, same "productivity dashboard" goal |
| `bento/` | Card-based modular grid — fits busyness meter, RevPASH, campaign status as separate cards |
| `minimal/` | Restraint baseline to check the others against |

The remaining 62 cover everything from `brutalism` to `pacman` to
`vintage` — not relevant to the merchant dashboard specifically, but
kept in full in case a different surface (a marketing page, the
consumer mobile app, a future portfolio piece) calls for a different
direction. Browse folder names for a quick sense of each, or check the
`description` field in any `SKILL.md`'s frontmatter.
