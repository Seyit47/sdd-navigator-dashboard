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
| **Claude API (in CI)** | `@anthropic-ai/sdk` 0.128.0, model `claude-opus-5` | A GitHub Action (`.github/workflows/pr-summary.yml`) that writes an AI summary into PR descriptions. Removed on 2026-09-25: the API key had no credits, so every run failed. |
| **Supporting tools driven by the AI** | pnpm 12, Node 24, Vitest 5, headless Google Chrome (DevTools protocol), `curl` | Installs, tests, checking the live API, real-browser layout and interaction checks. |

Tool calls in the main session: Bash 279, Write 21, AskUserQuestion 13, Skill 12, Edit 6, Read 3, Agent 2.

## 2. Conversation Log

### Session 1 — install the process plugin
- **When:** 2026-09-23 20:07:54 → 20:08:20 UTC (26 s). Transcript `be84d39f…`.
- **Asked:** install `superpowers@claude-plugins-official`.
- **What happened:** `claude` wasn't on `PATH`. The AI found the CLI binary bundled inside the VS Code extension, but the install failed because the plugin wasn't in the local marketplace cache.
- **Rejected:** the developer declined the follow-up `plugin marketplace update` command. The plugin was later present (6.4.1), so it was installed outside this transcript.

### Session 2 — initial commit
- **When:** 2026-09-24 11:54:37 → 11:55:20 UTC (43 s). Transcript `74e4b6c0…`.
- **Asked:** "push current changes as initial commit".
- **Accepted:** commit `ec4cc91 Initial commit` (the create-next-app scaffold).
- **Rejected:** the push over HTTPS failed (no credentials in the AI's shell) and SSH was denied. The developer declined a retry that would have used their private SSH key directly, and pushed themselves.

### Session 3 — main development session
- **When:** 2026-09-24 14:09:16 → 2026-09-25 00:31 UTC (≈ 10 h 22 min including breaks; still open when this document was last updated). Transcript `e98aa866…`.

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
| 23:36–23:40 | Deliverables | live URL in the README, deliverables checklist | README links the Vercel URL and the repository; a test guards descriptions and links | — |
| 23:41–23:57 | UI refresh + API filtering | "more user friendly … minimalist", and filters sent to the API as query parameters | Direction A ("soft cards") from three mockups; server-side fan-out of multi-select filters; spec, plan, native execution | Kept the work on `feat/dashboard` instead of a new branch |
| ≈00:05 | Live API check | "it is not fetching from live API" | Evidence showed the server does call the API (5 HTTPS connections, filtered result); the README now explains why the calls are not in the browser's Network tab | — |
| 00:07–00:10 | SDD audit | evaluate the repo against the four SDD pillars | A rated report with 15 violations | — |
| 00:13–00:30 | Audit fixes | "fix all these" | All 15 fixed on `fix/sdd-audit` (see Timeline and Course Corrections) | Chose to remove the PR-summary action (no API credits) and delete the plan documents |
| 00:35–01:10 | Second audit + fixes | re-evaluate, then "fix them all rewriting history" | Strict coverage gate, workflow scanning, `Refs:` on every commit type and in CI, shared setup action on Node 24 actions, card-surface utilities, no internal-only exports, browser-check annotations; **history rewritten** so every commit carries `Refs:` | — |

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
| 2 | Initial commit (`ec4cc91`) | 09-24 11:54 | 11:55 | 1 min |
| 3 | Husky build hooks + `CLAUDE.md` (`70c2215`, `9175dc8`) | 14:10 | 14:16 | 6 min |
| 4 | Scoping, API discovery | 14:20 | 14:28 | 8 min |
| 5 | Step 1: `requirements.yaml` draft | 14:28 | 14:35 | ≈ 7 min (review waited until 21:04) |
| 6 | PR-summary GitHub Action (`9ce5a65`) | 19:11 | 19:41 | 30 min |
| 7 | Secret diagnosis → repository secret | 20:54 | 20:56 | 2 min |
| 8 | PR #1 merged | 21:02 | — | — |
| 9 | Step 1 finalised (Vercel) → PR #2 squash-merged (`da1ce15`) | 21:04 | 21:16 | 12 min |
| 10 | Conventional Commits + commitlint → PR #3 (`9941938`, `6f7baaa`) | 21:07 | 21:12 | 5 min |
| 11 | Step 2 design → spec (`101b50c`) | 21:23 | 21:31 | 8 min |
| 12 | Step 2 plan (`ee0b0f9`) | 21:32 | 21:39 | 7 min |
| 13 | Step 2 implementation, 5 TDD tasks (`82a39ec` → `afa6e0f`) | 21:44 | 21:49 | 5 min |
| 14 | Step 2 review + fixes (`7a99405`) → PR #4 merged | 21:49 | 22:04 | 15 min |
| 15 | Steps 3–5 brainstorming (visual companion) → spec (`2c75a08`) | 22:05 | 22:30 | 25 min |
| 16 | Steps 3–5 plan (`98298ba`, 4,006 lines) | 22:31 | 22:49 | 18 min |
| 17 | Steps 3–5 implementation, 9 TDD tasks (`a96dbff` → `4e795fa`) | 22:56 | 23:04 | 8 min |
| 18 | Final review + fix pass (`287032a` → `1353137`), Chrome verification | 23:05 | 23:20 | 15 min |
| 19 | `PROCESS.md` (`b600a04`) | 23:26 | 23:36 | 10 min |
| 20 | Deliverables: live URL in README (`ce57f18`) | 23:36 | 23:41 | 5 min |
| 21 | UI refresh: design with mockups → spec (`92ae0f1`) | 23:41 | 23:47 | 6 min |
| 22 | UI refresh: plan (`5b4bb3b`) | 23:48 | 23:57 | 9 min |
| 23 | UI refresh: 5 TDD tasks (`996e7a2` → `d2e9092`), Chrome verification | 23:58 | 00:05 | 7 min |
| 24 | "Not fetching from live API": root-cause investigation | 00:05 | 00:07 | 2 min |
| 25 | PR #5 merged (`d86c0ef`); CI green on the PR and on `main` | 00:08 | — | — |
| 26 | SDD four-pillar audit | 00:07 | 00:12 | 5 min |
| 27 | Audit fixes on `fix/sdd-audit` (`4046774` → last commit) | 00:13 | 00:31 | 18 min |
| 28 | Second audit; CI found the browser check failing on GitHub's runner | 00:35 | 00:45 | 10 min |
| 29 | Second round of fixes; history rewritten with `git filter-branch` (messages only, trees identical; backups tagged `backup/*-before-rewrite`) | 00:45 | 01:10 | 25 min |

Merged PRs: #1 build hooks (21:02), #3 conventional commits (21:11), #2 requirements spec (21:16, squash), #4 data layer (22:04), #5 dashboard, UI refresh and API-side filtering (00:08). The audit fixes are on `fix/sdd-audit`.

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
| Where filtering happens (revised) | Server fetches with the filters as query parameters; one request per selected value, merged | Keep in-memory filtering; fetch from the browser | Developer asked for filters in the API request; server-side keeps one code path for mock and API mode. |
| Pending feedback | Explicit pending state in `useDashboardQuery` | React `useOptimistic` | `useOptimistic` drops the pressed state when its transition settles; the explicit state is deterministic and testable. |
| Visual design (revised) | "Soft cards": tokens, segmented filters, tinted status pills, KPI cards | App shell with sidebar; editorial single column | Chosen by the developer from browser mockups. |
| Theme tokens | One declaration per token with `light-dark()`; `data-theme` only switches `color-scheme` | Two dark blocks (OS preference and toggle) | Removes duplicated values; verified in Chrome for OS light/dark and both toggle overrides. |
| Commit traceability | `Refs: SCD-…` footer required for `feat`/`fix`/`refactor`/`perf`/`test`, checked by a local commitlint rule | Requirement id in the subject | Keeps the subject readable; history before the rule cannot be rewritten. |
| Browser verification | `scripts/check-browser.mjs` over the Chrome DevTools protocol, in CI and after each Production deployment | Playwright | No new dependency; Chrome is preinstalled on GitHub's runners. |
| PR-summary action | Removed | Keep it and skip when the API rejects the request | No API credits; outside the brief; its failing check was noise on every PR. |

## 5. What the Developer Controlled

**Gates the developer approved explicitly:** every design, spec and plan below needed an explicit "yes" before any code was written:
- hook design, PR-summary design;
- `requirements.yaml` (answered 3 open questions);
- data-layer design sections 1–2, spec `docs/superpowers/specs/2026-09-25-data-layer-design.md`, plan (commit `ee0b0f9`; plan files removed from the tree in `4046774`);
- dashboard design sections 1–3 (with the Step 5 scope folded in), spec `docs/superpowers/specs/2026-09-25-dashboard-design.md`, plan (commit `98298ba`);
- UI refresh design (direction A from mockups), spec `docs/superpowers/specs/2026-09-25-ui-refresh-design.md`, plan (commit `5b4bb3b`);
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
- `pnpm validate`: typecheck, lint, tests, build, coverage — 309 tests and 100 % (26/26) on `fix/sdd-audit`.
- `pnpm check:browser` (phone layout, filter feedback, server-side filtering, themes, console errors) and `pnpm test:contract` against the live API — both in CI since `7496992`.
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

10a. **Branch choice** (23:45). The developer rejected a new branch for the UI refresh and kept the work on `feat/dashboard`.
10b. **"Not fetching from live API"** (≈00:05). Investigated before changing anything: the dev server was in API mode, opened 5 HTTPS connections to the API per page and rendered API-filtered data. The confusion came from the design (the server calls the API, so nothing shows in the browser's Network tab); the README now says so.
10c. **PR-summary failures** (00:14). The developer identified the cause: no API credits. The action and its SDK dependency were removed.
10e. **History rewrite** (00:50). After a second audit rated commit traceability PARTIAL, the developer asked to rewrite history: every commit now carries a `Refs: SCD-…` footer (early subjects reworded to Conventional Commits), verified by commitlint over the whole history and identical file trees. Hashes in this document were updated.
10d. **SDD audit** (00:07–00:30). The developer asked for a four-pillar evaluation and then for every violation to be fixed: commit `Refs:` rule, per-`describe` `@req` annotations with a guard test, `@req` on every config file, shared enums/ordering/result types, one declaration per theme token, automated browser/contract/deployment checks, no dead code, and an accurate README.

**Corrections found by verification the developer set up** (reviewer subagents, TDD, browser checks), all fixed with a failing-then-passing test:

10. **Data layer:** `getRequirement(".")` or `("..")` escaped to other endpoints in API mode. A unit test depended on the developer's shell environment and could block unrelated commits.
11. **Accessible names:** sort buttons were announced as "Sort byID". Fixed with `aria-label`; the column header keeps its own name.
12. **Lost clicks:** every filter click and keystroke re-rendered the page on the server, and quick clicks overwrote each other. The URL is now written with `history.replaceState`. The test double was rewritten so the unit tests would have caught it.
13. **Search box drift:** the search box went out of step with the URL after navigation; it now re-syncs.
14. **Phone layout:** at 360 px the pages were ~600 px wide, caused by grid items' default min-width and absolutely positioned screen-reader text inside scroll boxes. Fixed and measured at exactly 360 px in Chrome.
15. **Coverage miscounting:** `@req SCD-UI-0010` was credited to `SCD-UI-001`. Ids now must match exactly, and malformed ids in `requirements.yaml` are rejected.

## 7. Self-Assessment — SDD pillars

State after the audit fixes on `fix/sdd-audit`.

| Pillar | Well covered | Needs improvement |
|---|---|---|
| **Traceability** | 26 requirements, each with a MUST/SHOULD description (test-enforced). `@req` on every tracked source, script, hook, workflow and config file, and on every `describe` block (guarded by tests). `pnpm check:coverage --strict`: **100 % (26/26 covered, 0 partial, 0 orphans)**. **Every commit** in history carries `Refs: SCD-…` (history rewritten; commitlint passes over all commits), enforced for new commits by the commit-msg hook and in CI for every PR commit. | Commit `Refs:` are checked for format, not for whether the listed requirements match the change. |
| **DRY** | API types only from the Zod schemas; enum values once (`src/lib/api/enums.ts`); row ordering once (`src/lib/api/sort.ts`, shared by the mock server and the UI); the coverage script reuses the app's model and `Result` types; each theme token declared once via `light-dark()`. A guard test (`scripts/dry.test.ts`) fails on regressions. | The mock server keeps its own single-value filter on purpose, to mirror the API's behaviour. |
| **Deterministic Enforcement** | Hooks: pre-commit (tests, build), pre-push (+ typecheck, lint, coverage gate), commit-msg (Conventional Commits + `Refs:`). CI: PR commit messages, `pnpm validate` (strict coverage), `pnpm check:browser` (real Chrome, failures as annotations) and `pnpm test:contract` (live API), on Node 24 actions. Production deployments are browser-checked. | The browser check failed on GitHub's runner in the first CI run; its failures now appear as annotations so the cause can be read and fixed. |
| **Parsimony** | Runtime dependencies: Next, React, Zod. No UI or chart library; no Playwright. The PR-summary action, its SDK dependency, the dead `formatTaskStatus` and 8.3k lines of plan documents were removed; the OpenAPI contract is committed once under `docs/api/`. README is 69 lines. | Commitlint and the testing libraries are the largest dev dependencies; both are justified by requirements (SCD-VAL-003, SCD-A11Y-002). |
