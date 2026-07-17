# AGENTS.md

## Mindset

Build this as a tray-first Jira time tracking app, not a full Jira client. The core loop is: open tray, find the right ticket, add time in 15-minute steps, close, and get back to work.

Prioritize speed, trust, and low friction over feature breadth. Every screen should feel useful in a small menu-bar window, work well by keyboard, and avoid blocking confirmation flows unless data loss or credential changes are involved.

Use the existing visual direction: Shadcn 4, Nova style, Zinc colors, Geist font, Lucide icons, Tailwind CSS v4, React 19, Vite, and Deno Desktop.

Build with tests as a first-class design constraint. Vitest coverage is crucial for domain logic, Jira API adapters, time calculations, reminder scheduling, and regression-prone UI behavior.

The app is built via Deno Desktop for macOS, Windows, and Linux. Load the `deno-desktop` skill before changing desktop code.

## Product Shape

- First launch shows onboarding until valid Jira email, API token, and base host are saved.
- Main tray view shows recent tickets, last worked tickets, free ticket search, quick `+15m` logging, and current-month tracked time with previous-month selection.
- Secondary view shows the latest added Jira worklogs.
- Settings include Jira credentials, host, notification preferences, and up to two daily reminders.
- Native desktop responsibilities belong in Deno Desktop: tray/menu-bar behavior, small windows, notifications, and secure local integration.

## Current Folder Structure

```txt
src/
  App.tsx                         # Browser mockup gallery plus /panel real tray app
  main.tsx                        # Vite browser entry
  index.css                       # Tailwind v4 theme and global styles
  assets/                         # Static frontend assets
  components/
    ui/                           # Shadcn-generated primitives; keep changes minimal
    tray/                         # Real tray popover shell, tracking view, worklog view, log-time sheet
    onboarding/                   # First-run Jira setup flow
    settings/                     # Real credentials and notification settings UI
    mockup/                       # Design-review/demo app components and device framing only
  data/                           # Domain types/constants plus mock data for mockup components only
  lib/                            # Shared frontend utilities
```

## Intended Folder Structure

Add these folders when moving from mockup to real app behavior:

```txt
src/
  features/
    jira/                         # Jira API client, issue search, recent tickets, worklog calls
    tracking/                     # Time-entry domain logic, month totals, worklog aggregation
    reminders/                    # Reminder scheduling and notification preferences
  storage/                        # Local settings, cached tickets, and credential access wrappers
  routes/                         # Vite SSR/local HTTP routes if needed by the desktop shell
```

## Project Rules

1. Keep the tray workflow fast: common actions should take one click or one shortcut, and time logging should default to 15-minute increments.
2. Keep secrets out of React persistence, logs, mocks, and screenshots. Jira tokens are saved Deno-side only and must not be returned through renderer bindings.
3. Keep the Deno Desktop bridge narrow and validated. Do not expose broad filesystem, network, or credential APIs to the webview.
4. Keep Jira data normalized at the feature boundary. UI components should consume app-level types, not raw Jira REST response shapes.
5. Add or update Vitest tests with meaningful logic changes. Prefer small, deterministic tests around time tracking, Jira mapping, storage boundaries, and notification scheduling.
6. Keep `src/components/ui/` close to generated Shadcn code. Build product behavior in feature or screen components instead of modifying primitives heavily.
7. Treat the app as tray-first. Desktop startup code lives in `desktop/main.ts`, and the real popover UI renders through `/panel`; do not turn the default desktop launch back into a normal full-window Vite app.
8. Keep Deno Desktop on the default `webview` backend unless there is a concrete need for CEF. Bundle size matters.
9. This app uses an explicit Desktop entry (`desktop/main.ts`) instead of Vite framework autodetection. Keep the Desktop task permission flags plus `--include dist --exclude node_modules`; the entrypoint needs env/read/write/net/run for local settings, bundled assets, loopback serving, Jira verification, and opening OS notification settings.
10. Desktop settings live in the OS app-data/config directory via `desktop/main.ts`. The renderer should receive public settings only, never raw tokens.
11. Deno Desktop 2.9.1 exposes `BrowserWindow.bind` as a one-argument native function, so `win.bind(name, handler)` drops the handler and causes `No callback bound for: ...`. Until this is fixed in the runtime, use the narrow same-origin `/api/jira-settings` endpoint in `desktop/main.ts` instead of Desktop bindings for Jira settings.
12. Deno Desktop may auto-navigate the implicit startup window to `/`; the renderer must treat the presence of Desktop bindings as desktop mode, not rely only on `location.pathname === "/panel"`.
13. The tray popover currently uses a frameless `BrowserWindow` positioned from `tray.getBounds()`. Do not switch back to `tray.attachPanel()` without retesting; it exited under HMR when the adopted startup window was hidden.
14. Keep `desktop:dev` on `deno desktop --hmr`; without `--hmr`, `deno desktop` builds the bundle and exits. Restart the process after startup-only window/tray changes.

## Real App vs Mockup Boundary

- `src/components/tray/` and `src/components/settings/` are production UI. They must be real-app-only and must not import `@/data/mock`.
- Do not add `mode="real" | "mock"`, `isMock`, `demo`, or similar branches to production components. If a demo needs different data or behavior, create a dedicated component under `src/components/mockup/`.
- `src/components/mockup/` owns the design/demo app. It may import `@/data/mock` and may wrap or reuse low-level real components only when those components are fully data-driven and do not need mock/real conditionals.
- `src/data/domain.ts` owns shared app-level types and non-mock constants. Production components should import domain types/constants from there, not from `src/data/mock.ts`.
- `src/data/mock.ts` is for mockup components only. Any `@/data/mock` import outside `src/components/mockup/` should be treated as a bug.
- Real app loading and empty states should be first-class UI states: use skeletons, clear empty messages, and Jira-backed data from the desktop API. Do not seed real UI with mock fallback rows, users, worklogs, or month totals.

## Verification

- Run `npm run typecheck` after TypeScript changes.
- Run `npm run test:run` after logic changes, bug fixes, and Jira/Deno integration work.
- Run `npm run lint` after behavior or component changes. Current full-lint baseline still fails in generated UI primitives (`badge.tsx`, `button.tsx`, `tabs.tsx`) on `react-refresh/only-export-components`; do not treat those as newly introduced unless you touched them.
- Run `npm run build` before packaging or changing Vite/Deno Desktop integration.
- For Deno Desktop work, run `deno check --desktop desktop/main.ts`; plain `deno check desktop/main.ts` does not load Desktop API types. Smoke-test with `deno task desktop:dev` when available.
