# Design system references

Five style guides pulled from [typeui.sh/awesome-design-skills](https://github.com/typeui-sh/awesome-design-skills)
(67 available, MIT licensed), kept here as reference material for the
merchant dashboard's still-undecided visual identity — see the "Open /
unresolved" note in [`../../architecture/DECISIONS.md`](../../architecture/DECISIONS.md).

Each folder has a `SKILL.md` (tokens, component rules, accessibility
constraints — written for an AI agent to follow) and a `DESIGN.md`
(human-readable rationale). These are **not** wired up as invokable
Claude Code skills in this repo — they're plain reference files. Read
the relevant one before designing a screen; don't guess at a palette.

| Folder | Why it's here |
|---|---|
| `shadcn/` | Tailwind-native components — matches the stack already decided (React + Vite + Tailwind, ADR-0009) |
| `ant/` | Built for data-dense admin/dashboard UIs — closest match to a restaurant manager glancing mid-shift |
| `enterprise/` | Dark-theme alternative with the same "strong data hierarchy for productivity dashboards" goal |
| `bento/` | Card-based modular grid — fits busyness meter, RevPASH, and campaign status as separate scannable cards |
| `minimal/` | Restraint baseline to check the other four against, since dashboard styles can get visually heavy |

The other 62 skills in the full pack (brutalism, neon, cosmic, pacman,
retro, etc.) were reviewed and skipped as not relevant to this
merchant-facing tool. The full pack, if a different style direction is
ever wanted, was downloaded to `~/Downloads/awesome-design-skills-main.zip`.
