# PROCESS.md — how this project was built with AI

This document reconstructs the AI-assisted development of the SDD Navigator Dashboard from the Claude Code session transcripts (`~/.claude/projects/-home-seyit-www-sdd-navigator-dashboard/*.jsonl`, including subagent transcripts) and the git history. Timestamps come from the transcript metadata and are given in **UTC**; the developer's local time is UTC+5 (commit timestamps carry `+05:00`). Durations are wall-clock and include pauses.

## 1. Tools Used

| Tool | Version / identifier | Used for |
|---|---|---|
| **Claude Code** — VS Code extension | 2.1.280 → 2.1.281 | The only AI coding tool. All sessions ran in the IDE, with the open file passed as context. |
| **Model** | `claude-opus-5-5` (every assistant turn in every transcript) | Planning, design, code, tests, git operations, review. |
| **Reviewer subagents** | 2 general-purpose agents, requested with the `fable` model alias (transcripts record `claude-opus-5-5`) | Independent whole-branch code review at the end of the data-layer and dashboard work. |
| **Plugin: superpowers** | 6.4.1 (`claude-plugins-official`) | Process skills: `using-superpowers`, `brainstorming` (including its browser **visual companion** for layout mockups), `writing-plans`, `executing-plans`, `test-driven-development`, `finishing-a-development-branch`. |
| **Bundled skills** | `claude-api`, `dataviz` | `claude-api`: SDK usage and model choice for the PR-summary GitHub Action. `dataviz`: chart form, the status colour palette and the stat-tile / meter design of the summary panel. |
| **Claude Code memory** | `memory/*.md` | Project context and the developer's working preferences, carried between sessions. |
| **Claude API (in CI)** | `@anthropic-ai/sdk` 0.128.0, model `claude-opus-5` | A GitHub Action (`.github/workflows/pr-summary.yml`) that writes an AI summary into PR descriptions. |
| **Supporting tools driven by the AI** | pnpm 12, Node 24, Vitest 5, headless Google Chrome (DevTools protocol), `curl` | Installs, tests, checking the live API, real-browser layout and interaction checks. |

Tool calls in the main session: Bash 187, Write 14, AskUserQuestion 12, Skill 11, Edit 6, Read 2, Agent 2.

## 2. Conversation Log

### Session 1 — install the process plugin
- **When:** 2026-09-23 20:07:54 → 20:08:20 UTC (26 s). Transcript `be84d39f…`.
- **Asked:** install `superpowers@claude-plugins-official`.
- **What happened:** `claude` wasn't on `PATH`. The AI found the CLI binary bundled inside the VS Code extension, but the install failed because the plugin wasn't in the local marketplace cache.
- **Rejected:** the developer declined the follow-up `plugin marketplace update` command. The plugin was later present (6.4.1), so it was installed outside this transcript.

### Session 2 — initial commit
- **When:** 2026-09-24 11:54:37 → 11:55:20 UTC (43 s). Transcript `74e4b6c0…`.
- **Asked:** "push current changes as initial commit".
- **Accepted:** commit `554f354 Initial commit` (the create-next-app scaffold).
- **Rejected:** the push over HTTPS failed (no credentials in the AI's shell) and SSH was denied. The developer declined a retry that would have used their private SSH key directly, and pushed themselves.

### Session 3 — main development session
- **When:** 2026-09-24 14:09:16 → 23:27 UTC (≈ 9 h 18 min including breaks; still open when this document was written). Transcript `e98aa866…`.

| Time (UTC) | Topic | What the developer asked for | Accepted | Rejected / corrected |
|---|---|---|---|---|
| 14:10–14:13 | Git hooks | pre-commit and pre-push hooks that block on a failing build | Husky hooks running `pnpm build`, on a branch, tested with a deliberate type error | Interrupted the AI's direct `pnpm add husky` and made it follow the brainstorm → approved-design workflow first |
| 14:13–14:19 | Commit and push | commit, push, and record the rules in `CLAUDE.md` | `CLAUDE.md` with branch-first and hook rules | Challenged why the AI couldn't push ("VS Code has access", "it's HTTPS not SSH"); rejected an `ssh-add` probe. Ended up pushing from the VS Code terminal |
| 14:20–14:28 | Scoping | "plan next steps"; SDD = spec-driven development; API at `https://api.pdd.foreachpartners.com` | AI inspected the OpenAPI spec and the live API (CORS open, data consistent) | Deferred the view list: "I will describe it in next steps" |
| 14:28 | **Step 1** — spec first | `requirements.yaml` with ≥ 8 verifiable requirements | 19 requirements (later 24), `type: FR/AR` added for compatibility with the Navigator API | — |
| 19:11–19:41 | PR summary | "summary message of what was changed in PR" | GitHub Action + Claude API writing between markers in the PR description | Redirected: a local pre-commit hook → PR description on GitHub → GitHub Action. Skipped the AI's dry run ("I will test it myself in PR"). Questioned the need for the SDK, then kept it ("continue old way") |
| 20:54 | CI secret | the action didn't get `ANTHROPIC_API_KEY` | Moved the key to a repository secret | Developer diagnosed it themselves: the key was an **environment** secret (Preview/Production) |
| 21:04–21:05 | Step 1 review | answered the open spec questions | Vercel deployment; mode chosen by whether `NEXT_PUBLIC_API_URL` is set; scope unchanged | — |
| 21:07–21:22 | Commit conventions | Conventional Commits rule in `CLAUDE.md` | Rule + commitlint `commit-msg` hook; merged PRs #1 and #3 | Squash-merged PR #2 to fix a non-conventional commit that had already been pushed |
| 21:23–22:04 | **Step 2** — data layer | typed client, mock provider, typed errors, fixture data | Zod schemas as the single source; Result type; both transports; `pnpm test` in both hooks; "native" execution; PR #4 merged | — |
| 22:05–22:31 | **Steps 3–5** — design | dashboard UI, tests, self-validation, deployment | Hybrid rendering; one-page layout (A); tasks filter in the URL; one combined spec | Chose summary layout **B** over the AI's recommended A; rejected a 3-question clarification prompt and pasted Step 5 instead, which settled the "malformed YAML" question |
| 22:31–22:55 | Plan | review of the 9-task plan | Plan approved; native execution | — |
| 22:56–23:19 | Implementation and review | (autonomous execution) | 9 tasks, a 4-fix review pass, `pnpm validate` green, coverage 100 % | — |
| 23:26 | This document | produce `PROCESS.md` | — | — |

### Subagent sessions (started from session 3)

| Agent | When (UTC) | Task | Outcome |
|---|---|---|---|
| `ae3e450b…` | 2026-09-24 21:49:52 → 21:52:37 (2 min 45 s) | Review the data-layer branch | "With fixes", 8 Minors. Two were fixed: dot-segment ids escaping the route, and a test that failed when `NEXT_PUBLIC_API_URL` was exported in the shell. |
| `aaf931d9…` | 2026-09-24 23:05:33 → 23:11:24 (5 min 51 s) | Review the dashboard branch (including headless-Chrome checks) | "With fixes", 4 Important and 7 Minor. All 4 Important were fixed. |

## 3. Timeline

Times are UTC, taken from commit timestamps and transcript events.

| # | Step | Start | End | Duration |
|---|---|---|---|---|
| 1 | Plugin install attempt | 09-23 20:07 | 20:08 | < 1 min |
| 2 | Initial commit (`554f354`) | 09-24 11:54 | 11:55 | 1 min |
| 3 | Husky build hooks + `CLAUDE.md` (`9ef1b3b`, `d4f88fc`) | 14:10 | 14:16 | 6 min |
| 4 | Scoping, API discovery | 14:20 | 14:28 | 8 min |
| 5 | Step 1: `requirements.yaml` draft | 14:28 | 14:35 | ≈ 7 min (review waited until 21:04) |
| 6 | PR-summary GitHub Action (`30fd69b`) | 19:11 | 19:41 | 30 min |
| 7 | Secret diagnosis → repository secret | 20:54 | 20:56 | 2 min |
| 8 | PR #1 merged | 21:02 | — | — |
| 9 | Step 1 finalised (Vercel) → PR #2 squash-merged (`1abda59`) | 21:04 | 21:16 | 12 min |
| 10 | Conventional Commits + commitlint → PR #3 (`9c9de6b`, `1b88206`) | 21:07 | 21:12 | 5 min |
| 11 | Step 2 design → spec (`4733e9a`) | 21:23 | 21:31 | 8 min |
| 12 | Step 2 plan (`d9fa28a`) | 21:32 | 21:39 | 7 min |
| 13 | Step 2 implementation, 5 TDD tasks (`0fd48ff` → `10bfcb7`) | 21:44 | 21:49 | 5 min |
| 14 | Step 2 review + fixes (`984b8af`) → PR #4 merged | 21:49 | 22:04 | 15 min |
| 15 | Steps 3–5 brainstorming (visual companion) → spec (`8bfb883`) | 22:05 | 22:30 | 25 min |
| 16 | Steps 3–5 plan (`532cc37`, 4,006 lines) | 22:31 | 22:49 | 18 min |
| 17 | Steps 3–5 implementation, 9 TDD tasks (`f6e622f` → `40b779a`) | 22:56 | 23:04 | 8 min |
| 18 | Final review + fix pass (`51ac46d` → `5111813`), Chrome verification | 23:05 | 23:20 | 15 min |
| 19 | `PROCESS.md` | 23:26 | — | — |

Merged PRs: #1 build hooks (21:02), #3 conventional commits (21:11), #2 requirements spec (21:16, squash), #4 data layer (22:04). The dashboard branch (`feat/dashboard`) is not pushed yet.

## 4. Key Decisions

| Decision | Chosen | Alternatives considered | Why |
|---|---|---|---|
| Working method | Spec → design approval → written plan → TDD execution → independent review | Ask-and-code directly | The developer stopped an immediate install in the first request; approval gates became a standing rule (saved to memory). |
| Hook runner | Husky | Plain `.githooks` + `core.hooksPath`, simple-git-hooks, lefthook | Standard for Node projects; hooks install automatically via `prepare`. |
| PR summary | GitHub Action on `pull_request` | Local pre-push hook + `gh` CLI | Git has no post-push hook, and the AI's shell had no GitHub credentials; an Action works for every push. |
| Action secret | Repository secret | Bind the job to the Preview or Production environment | Keeps the Vercel environments separate; no fake "deployments" on PR runs. |
| Requirement IDs | `SCD-{AREA}-{NNN}` + `type: FR/AR` | IDs only | Same shape as the Navigator API's `Requirement`, so the project can be scanned by the tool it visualises. |
| Data mode | Non-empty `NEXT_PUBLIC_API_URL` → API, otherwise mock | An explicit `NEXT_PUBLIC_DATA_MODE` | One variable, nothing to keep in sync. |
| Deployment | Vercel (PR → Preview, `main` → Production) | Generic `next start`, Docker | The repository already had Vercel's Preview and Production environments. |
| Types + validation | Zod schemas, types via `z.infer` | openapi-typescript + hand-written guards; hand-written types | One source of truth; malformed responses become a typed `invalid_response` error. |
| Error model | `Result<T>` with `network` / `not_found` / `http` / `invalid_response` | Thrown exceptions | The step required "no thrown exceptions for expected failures". |
| Mock fixtures | Copied from the live API | The OpenAPI examples | The live data matches the step's numbers; the OpenAPI example contradicted itself (`FR-API-002` partial vs 5/1/2 stats). |
| Rendering | Hybrid: server fetch, client filter/sort in memory, URL state | Server-only (re-fetch per click); client-only | Shareable URLs with instant filtering, and no API calls from the browser. |
| URL updates | `history.replaceState` (after review) | `router.replace` (original plan) | `router.replace` re-rendered the dynamic page on the server for every click and lost quick clicks. |
| Layout | One scrolling page + detail route (A) | Tabs (B); table with detail drawer (C) | Everything visible at once; the detail page gets its own URL (SCD-UI-004). |
| Summary panel | Four equal tiles + one bar per status (B) | Hero coverage figure + stacked bar (A, AI's recommendation) | Developer preferred counts that are easy to compare. |
| Status colours | Fixed good/warning/critical palette + icon + label | Categorical palette | The dataviz rules treat coverage status as state; colour is never the only signal. |
| Accessibility automation | axe-core in jsdom + a token-contrast unit test | Playwright + axe in CI | No browser download (flaky registry); contrast is still checked deterministically. |
| Self-validation | `scripts/check-coverage.ts` on Node's native TypeScript support; exit 0/1/2 | ts-node/tsx; a JS script | No extra dependency; pure functions under test. |
| Enforcement split | Hooks: tests/build (commit), + typecheck/lint (push); CI: `pnpm validate` incl. coverage gate | Coverage gate in hooks | Lets work-in-progress branches still be pushed; the gate is enforced before merge. |
| Commit hygiene | Conventional Commits, enforced by commitlint | Documented rule only | Developer asked for enforcement. |

## 5. What the Developer Controlled

**Gates the developer approved explicitly:** every design, spec and plan below needed an explicit "yes" before any code was written:
- hook design, PR-summary design;
- `requirements.yaml` (answered 3 open questions);
- data-layer design sections 1–2, spec `docs/superpowers/specs/2026-09-25-data-layer-design.md`, plan `docs/superpowers/plans/2026-09-25-data-layer.md`;
- dashboard design sections 1–3 (with the Step 5 scope folded in), spec `docs/superpowers/specs/2026-09-25-dashboard-design.md`, plan `docs/superpowers/plans/2026-09-25-dashboard.md`;
- the execution method for both plans.

**Choices the developer made or overrode:**
- the hook runner (Husky);
- the PR-summary mechanism (GitHub Action) and the secret scope;
- the deployment target (Vercel);
- the data-mode switch;
- the scope of Step 1;
- Zod;
- `pnpm test` in both hooks;
- hybrid rendering;
- layout A;
- summary panel B (against the AI's recommendation);
- `taskStatus` kept in the URL (the developer's addition);
- Conventional Commits with commitlint;
- squash-merging PR #2;
- keeping the SDK in the PR-summary action.

**Files the developer opened and reviewed in the IDE** during the session: `package.json`, `.husky/pre-push`, `CLAUDE.md`, `requirements.yaml`, `sdd-coverage-api.yaml` (a local copy of the API spec the developer added), `docs/superpowers/specs/2026-09-25-dashboard-design.md`, `next.config.ts`, `data/tasks.json`, `data/annotations.json`, `src/app/page.tsx`.

**Verification the developer did themselves:**
- **PR-summary action:** tested it on real PRs (declined the AI's local dry run). The merged PR descriptions contain no AI-summary block, so its output was not observed in any merged PR.
- **The action's missing secret:** diagnosed the root cause (environment-scoped secret) from the GitHub side.
- **Merging:** merged every PR through GitHub (#1, #3, #2 squash, #4). All pushes were done by the developer from their own terminal; the AI never had push credentials.
- **Commit history:** noticed that the pushed spec commit didn't follow the new convention and resolved it with a squash merge.

**Verification delegated to the AI:** the developer set these up but didn't run them personally in the transcript.
- TDD per step (tests watched failing, then passing).
- Hook runs on every commit.
- `pnpm validate`: typecheck, lint, 243 tests, build, coverage 100 % (24/24).
- The live-API contract test (8/8).
- Production smoke tests with `next start`.
- 360 px layout measurement and rapid-click checks in headless Chrome.
- Two independent reviewer subagents.

## 6. Course Corrections

**Corrections the developer initiated:**

1. **Process before code** (14:10). The AI began `pnpm add -D husky` straight away. The developer interrupted and invoked `/superpowers:using-superpowers`. From then on every change went through a stated design and an explicit approval, and the rule was saved to memory.
2. **Push capability** (14:16–14:19). The developer challenged the claim that the AI couldn't push ("VS Code has access", "it's HTTPS, not SSH"). The AI traced it to VS Code's `GIT_ASKPASS` helper, which isn't available to the extension's shell. The developer rejected the AI's attempts to use their SSH key directly and pushed from their own terminal.
3. **What "PR summary" meant** (19:11–19:16). The request said "pre-commit hook". When asked where the summary should end up, the developer said the PR description on GitHub. That led to a GitHub Action, since git has no post-push hook.
4. **Dry run skipped; SDK questioned** (19:28–19:37). The developer stopped the local dry run ("I will test it myself in PR") and questioned why an SDK was needed. After the explanation, they chose the original, pinned-dependency approach.
5. **Secret not available in the Action** (20:54). The developer identified that the key was an environment secret; it was moved to repository secrets. No code change was needed.
6. **Commit conventions** (21:07–21:22). The developer added the Conventional Commits rule. The AI reworded its unpushed commit, but the developer had already pushed the original, so they fixed `main`'s history with a squash merge.
7. **Summary panel design** (22:17). The developer rejected the AI's recommended "hero coverage + stacked bar" and chose four equal tiles + one bar per status.
8. **URL state for tasks** (22:20). The developer extended the design so the task-status filter is also kept in the URL.
9. **Too many questions** (22:24–22:27). The developer rejected a three-question clarification prompt and supplied Step 5 instead, which showed that "malformed YAML" referred to the self-validation script, not the data layer. This was saved to memory: make and flag decisions instead of batching questions.

**Corrections found by verification the developer set up** (reviewer subagents, TDD, browser checks), all fixed with a failing-then-passing test:

10. **Data layer:** `getRequirement(".")` or `("..")` escaped to other endpoints in API mode. A unit test depended on the developer's shell environment and could block unrelated commits.
11. **Accessible names:** sort buttons were announced as "Sort byID". Fixed with `aria-label`; the column header keeps its own name.
12. **Lost clicks:** every filter click and keystroke re-rendered the page on the server, and quick clicks overwrote each other. The URL is now written with `history.replaceState`. The test double was rewritten so the unit tests would have caught it.
13. **Search box drift:** the search box went out of step with the URL after navigation; it now re-syncs.
14. **Phone layout:** at 360 px the pages were ~600 px wide, caused by grid items' default min-width and absolutely positioned screen-reader text inside scroll boxes. Fixed and measured at exactly 360 px in Chrome.
15. **Coverage miscounting:** `@req SCD-UI-0010` was credited to `SCD-UI-001`. Ids now must match exactly, and malformed ids in `requirements.yaml` are rejected.

## 7. Self-Assessment — SDD pillars

| Pillar | Well covered | Needs improvement |
|---|---|---|
| **Traceability** | `requirements.yaml` is the single source (24 requirements, each with a verifiable MUST/SHOULD). Every source and test file carries `@req` ids. `pnpm check:coverage` reports covered/partial/missing plus orphans, and currently shows **100 % (24/24 covered, 0 partial)**. Specs and plans in `docs/superpowers/` record why each design was chosen. Commit messages map to tasks. | `@req` comments are per **test file**, not per test case (the Step 4 wording "every test" may mean the latter). Test vs implementation is decided by file name. SCD-DEP-002 (Vercel) counts as covered on thin evidence: a config comment and a README text test. |
| **DRY** | Zod schemas → TypeScript types (no parallel interfaces). One request pipeline for API and mock mode. Status labels, icons and colours in one table (`STATUS_PRESENTATION`). Query parsing and filtering shared by all views. A shared id pattern for the scanner (`scripts/coverage/ids.ts`). Theme colours only as CSS tokens (a test enforces this). | Sorting and filtering logic exists twice: in the mock server (`src/lib/api/mock.ts`) and in the UI (`src/lib/dashboard/query.ts`). Enum value lists are repeated in `options.ts` and the Zod enums. Dark-theme tokens are written twice in `globals.css` (a test guarantees they stay identical). |
| **Deterministic Enforcement** | Husky pre-commit (tests + build), pre-push (+ typecheck + lint), commit-msg (commitlint). `pnpm validate` chains typecheck → lint → tests → build → coverage gate, with defined exit codes (0/1/2). CI runs `pnpm validate` on PRs and `main`. Token contrast and "no hard-coded colours" are unit-tested; axe runs on every view. | The CI workflow hasn't run yet (the branch isn't pushed). The coverage gate isn't in the local hooks (deliberately, so work-in-progress can be pushed). The live-API contract test is opt-in. The PR-summary action is non-deterministic by nature and its output wasn't observed on merged PRs. Real-browser checks (360 px, rapid clicks) were one-off scripts, not part of CI. |
| **Parsimony** | Few runtime dependencies (Next, React, Zod). No UI or chart library: stat tiles and bars are plain markup with CSS tokens. The coverage script uses Node's built-in TypeScript support instead of a runner. Small, single-purpose modules. No Playwright. | Extras beyond the task: the PR-summary action pulls in `@anthropic-ai/sdk`, and there's the commitlint toolchain. Large process artifacts are committed (a 4,006-line implementation plan and design specs). The test tooling (jsdom, Testing Library, axe) is heavy for the size of the UI. |
