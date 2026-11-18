# Project Codex Skills

Twelve skills were installed locally for this project on 2026-11-18: eleven based on the owner's supplied skills catalog and the [implementation roadmap](docs/features/ROADMAP.md), plus Impeccable at the owner's subsequent explicit request. Their instructions and resources live in `.agents/skills/`; no user-wide installation was made.

The source revisions below are pinned to the commits used for installation. Each installed `SKILL.md` was checked for its expected name, description, and SHA-256 match against the reviewed source. Installation does not mean a skill was invoked or application work began.

| Installed skill | Relevant stages | Pinned upstream source |
| --- | --- | --- |
| [vercel-react-best-practices](.agents/skills/vercel-react-best-practices/SKILL.md) | 04 | [vercel-labs/agent-skills — 1a2c79d4e6c4](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices) |
| [vercel-composition-patterns](.agents/skills/vercel-composition-patterns/SKILL.md) | 04 | [vercel-labs/agent-skills — 1a2c79d4e6c4](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/composition-patterns) |
| [web-design-guidelines](.agents/skills/web-design-guidelines/SKILL.md) | 04, 05 | [vercel-labs/agent-skills — 1a2c79d4e6c4](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) |
| [modern-web-guidance](.agents/skills/modern-web-guidance/SKILL.md) | 04, 05 | [GoogleChrome/modern-web-guidance — 64a6d708f5a4](https://github.com/GoogleChrome/modern-web-guidance/tree/64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65/skills/modern-web-guidance) |
| [shadcn](.agents/skills/shadcn/SKILL.md) | 04 | [shadcn-ui/ui — 968d8cb9dc42](https://github.com/shadcn-ui/ui/tree/968d8cb9dc42ae5d52e8fd356cf84596ec832a26/skills/shadcn) |
| [frontend-design](.agents/skills/frontend-design/SKILL.md) | 04, only after Refero references are supplied | [anthropics/skills — e4bb5d960d87](https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/frontend-design) |
| [impeccable](.agents/skills/impeccable/SKILL.md), version 4.9.2 | 04, 05, only after Refero references and an interface are available | [pbakaus/impeccable — d41d9860b009](https://github.com/pbakaus/impeccable/tree/d41d9860b0094dcb68030657da63461212835aaa/.agents/skills/impeccable) |
| [nestjs-best-practices](.agents/skills/nestjs-best-practices/SKILL.md) | 01, 02, 03, 05 | [MattiaValerio/nest-skills — 6d1eafc0644e](https://github.com/MattiaValerio/nest-skills/tree/6d1eafc0644eb67c3a85a144ec01950f202f41a1/skills/nestjs-best-practices) |
| [docker-build-strategies](.agents/skills/docker-build-strategies/SKILL.md) | 01, 06 | [docker/skills — a65ae5b65d22](https://github.com/docker/skills/tree/a65ae5b65d22f0613375d6c3e5ea8bb287698cc0/skills/docker-build-strategies) |
| [docker-compose-patterns](.agents/skills/docker-compose-patterns/SKILL.md) | 01, 06 | [docker/skills — a65ae5b65d22](https://github.com/docker/skills/tree/a65ae5b65d22f0613375d6c3e5ea8bb287698cc0/skills/docker-compose-patterns) |
| [playwright-cli](.agents/skills/playwright-cli/SKILL.md) | 05, 06 | [microsoft/playwright-cli — 99c4eb256615](https://github.com/microsoft/playwright-cli/tree/99c4eb2566153f37fb104e5dbf894fb9c785e17d/skills/playwright-cli) |
| [github-actions-hardening](.agents/skills/github-actions-hardening/SKILL.md) | 06 | [github/awesome-copilot — a255a193d131](https://github.com/github/awesome-copilot/tree/a255a193d1318e5a9ca3e9e575897f9a7845c099/skills/github-actions-hardening) |

## Usage boundaries

- Read a selected skill's instructions when its implementation stage requires it. Installation alone is not a reason to invoke every skill.
- Keep the project's scope, architecture, read-only security constraints, and supplied design references authoritative. General NestJS examples of authentication, databases, events, or queues do not add those features to this MVP.
- The owner-supplied Refero pack is now present in [docs/design](docs/design/DESIGN.md). Before applying a frontend skill, follow [AGENTS.md](AGENTS.md) and explicitly read the description, JSON tokens, and both CSS exports. Installed frontend skills must preserve that reference direction and report consequential extraction conflicts.
- Impeccable was installed as a Codex skill only. Its engine was not downloaded or executed, no native hook was enabled, and no product/design initialization was run. First use of its launcher may require network access and a writable engine cache. For future live-mode copy editing, use `IMPECCABLE_LIVE_COPY_AGENT=chat` to keep edits in the existing authorized chat workflow.
- Use documentation matching the dependency versions actually selected during implementation. React/Next.js or shadcn examples may assume APIs unavailable in a different version.
- The Playwright skill is installed, but this operation did not install its CLI package, browser binaries, or an application test runner. Check and prepare those dependencies in the relevant implementation stage.
- Database/Prisma, Redis, BullMQ, MongoDB, AWS, and specialized Next.js caching skills were not installed for the current baseline. Reassess only if the corresponding functionality is justified.

## Maintenance

Before updating a skill, review the proposed upstream revision and preserve project-specific constraints. Update the source revision in this inventory after verifying the installed files. Do not execute installation commands from the original catalog automatically or treat the catalog's framework-version notes as selected application versions.

At the time of skill setup the application was **Planning**; no application packages, browser binaries, database services, or migrations were installed or started by that setup. Stage 01 application implementation is tracked separately in the [roadmap](docs/features/ROADMAP.md).
