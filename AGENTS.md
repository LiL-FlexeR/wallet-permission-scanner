# Wallet Permission Scanner — Repository Instructions

These instructions apply throughout this project. Follow the current user request and applicable instructions; use the documentation below to carry project context across Codex chats.

## Start of a task

- Read the [README](README.md), [roadmap](docs/features/ROADMAP.md), and the detailed specification for the stage being changed. Read the relevant architecture documents before changing contracts, blockchain behavior, risk rules, or deployment assumptions.
- Check the actual files and package scripts before acting. **Stages 01–03 are implemented**: application shells, workspace tooling/local containers, shared runtime contracts/address validation, reviewed registry, bounded readers/readiness, public scan/coverage APIs, pure risk analysis, abuse controls and generated OpenAPI exist. Product UI and deployment remain unimplemented. Optional live RPC verification has not run without credentials. Consult the roadmap for verified completion gates.
- Work only on the requested task or implementation stage. Documentation, skill setup, and adding design context do not start application implementation. When the user requests implementation, follow that stage's prerequisites and acceptance criteria without asking again for already-authorized work.
- Write project documentation in English. Preserve unrelated changes and owner-supplied source materials.

## Required design context

Before frontend planning, implementation, styling, review, or invoking a frontend design skill, explicitly open and read all four owner-supplied files:

1. [docs/design/DESIGN.md](docs/design/DESIGN.md): visual reference, interpretations, and reconstructed examples.
2. [docs/design/tokens.json](docs/design/tokens.json): structured extracted values and Refero provenance.
3. [docs/design/variables.css](docs/design/variables.css): CSS custom-property export.
4. [docs/design/theme.css](docs/design/theme.css): Tailwind v4 theme export; use only with a compatible installed version.

Read any additional owner-supplied screenshots or references relevant to the requested surface. Links in this file are instructions to read those resources, not a claim that their full contents are automatically loaded. Backend-only work does not require loading the entire visual reference pack.

- The supplied pack is the visual starting point for Stage 04. Preserve the owner's direction when using shadcn, frontend-design, or Impeccable; skill defaults must not replace it with an invented style.
- Apply the reference to Wallet Permission Scanner's actual functionality. Base branding, sample copy, metrics, links, and reconstructed components are reference content, not scanner requirements. The live network remains Ethereum mainnet, chain ID `1`.
- Preserve the four exported files unless the requested task calls for editing them. Add application-specific integration or token mappings in the frontend when that implementation is authorized; do not silently rewrite source exports.
- Inspect disagreements before using a value or role. The supplied text disagrees about whether the accent is a primary filled-action color, and some typography measurements differ between JSON and the prose/CSS exports. Report consequential conflicts rather than silently choosing a new design; continue work that does not depend on the missing decision.
- Font-family declarations are not bundled font files. Check actual availability and the supplied fallback guidance during implementation; do not claim the named fonts are installed.
- If required references are missing, unreadable, or insufficient for the requested visual decision, continue independent non-visual integration and report the specific dependency. Reference availability alone does not complete Stage 04.
- The authoritative design document is under `docs/design/`. A missing root-level `DESIGN.md` does not mean no design context exists. Do not generate a competing root design document or run design initialization merely to satisfy a skill's default lookup path.

## Architecture and safety invariants

- Use the planned pnpm monorepo: Next.js App Router frontend, NestJS REST backend, viem public client, and shared runtime API schemas. Select supported stable versions when implementation begins.
- Mainnet scans inspect only configured token/spender pairs. Never claim every approval was discovered. Re-read current `allowance(owner, spender)` at the stated snapshot; historical events are candidate evidence only.
- Keep risk calculation pure, deterministic, versioned, and separate from retrieval. Risk labels are explainable heuristics, not contract-safety or maliciousness findings.
- Use bigint internally and exact decimal strings over HTTP. A failed read is unknown, never zero. Preserve partial results and coverage/freshness information according to the [API contract](docs/architecture/api-design.md).
- Keep all chain operations read-only. No wallet connection, private keys, seed phrases, signing, transactions, revocation, or custody. RPC credentials remain backend-only.
- Follow the documented work limits, cancellation, rate limits, privacy rules, and secret redaction in the [security specification](docs/architecture/security.md).
- PostgreSQL/Prisma are optional and deferred; do not add persistence, Redis, queues, authentication, or microservices solely because a generic skill demonstrates them.

## Skills

- Use the [project skills inventory](skills.md) to select relevant installed skills; read selected instructions and version-specific references before applying them. Installation does not imply that every skill should run.
- Apply the relevant stage's recommendations. For UI work, read the design pack before applying frontend skills, including Impeccable. Do not run Impeccable init/document or enable hooks as a side effect of a documentation/context task.
- Do not install or update skills, application packages, or external services as unrelated setup. Perform necessary setup when it is part of the user's authorized implementation request.

## Verification and handoff

- For documentation changes, verify relative links, referenced files, and consistency with affected stage/architecture documents. Do not install an application toolchain just to check documentation.
- During implementation, run the actual scripts and meaningful checks required by the changed stage. Deterministic tests must not need paid RPC access, funded wallets, signatures, or transactions. Record unavailable or skipped checks honestly.
- Update affected contracts/docs together and mark roadmap progress only after the stage's Definition of Done is met. Preserve the distinction between implemented, tested, demo, and live behavior.
- Report what changed, what was checked, and remaining dependencies. Do not invent commands, deployed URLs, test results, performance metrics, or completed features.
