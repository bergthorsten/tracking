# AGENTS.md

## Mindset

Build this as a tray-first Jira time tracking app, not a full Jira client. The core loop is: open tray, find the right ticket, add time in 15-minute steps, close, and get back to work.

Prioritize speed, trust, and low friction over feature breadth. Every screen should feel useful in a small menu-bar window, work well by keyboard, and avoid blocking confirmation flows unless data loss or credential changes are involved.

Use the existing visual direction: Shadcn 4, Nova style, Zinc colors, Geist font, Lucide icons, Tailwind CSS v4, React 19, Vite, and Deno Desktop.

Build with tests as a first-class design constraint. Vitest coverage is crucial for domain logic, Jira API adapters, time calculations, reminder scheduling, and regression-prone UI behavior.

## Product Shape

- First launch shows onboarding for Jira email, Jira API token, and Jira base host.
- Main tray view shows recent tickets, last worked tickets, free ticket search, quick `+15m` logging, and current-month tracked time with previous-month selection.
- Secondary view shows the latest added Jira worklogs.
- Settings include Jira credentials, host, notification preferences, and up to two daily reminders.
- Native desktop responsibilities belong in Deno Desktop: tray/menu-bar behavior, small windows, notifications, and secure local integration.

## Current Folder Structure

```txt
src/
  App.tsx                         # Design mockup gallery until the real desktop entry exists
  main.tsx                        # Vite browser entry
  index.css                       # Tailwind v4 theme and global styles
  assets/                         # Static frontend assets
  components/
    ui/                           # Shadcn-generated primitives; keep changes minimal
    tray/                         # Tray popover shell, tracking view, worklog view, log-time sheet
    onboarding/                   # First-run Jira setup flow
    settings/                     # Credentials and notification settings UI
    mockup/                       # Design-review framing only
  data/                           # Mock data only; replace with Jira/storage-backed sources
  lib/                            # Shared frontend utilities
```

## Intended Folder Structure

Add these folders when moving from mockup to real app behavior:

```txt
src/
  desktop/                        # Deno Desktop entry, tray, windows, menus, notifications, bindings
  features/
    jira/                         # Jira API client, issue search, recent tickets, worklog calls
    tracking/                     # Time-entry domain logic, month totals, worklog aggregation
    reminders/                    # Reminder scheduling and notification preferences
  storage/                        # Local settings, cached tickets, and credential access wrappers
  routes/                         # Vite SSR/local HTTP routes if needed by the desktop shell
```

## Project Rules

1. Keep the tray workflow fast: common actions should take one click or one shortcut, and time logging should default to 15-minute increments.
2. Keep secrets out of React state persistence, logs, mocks, and screenshots. Jira tokens must go through a Deno-side storage/access layer before any real integration ships.
3. Keep Deno Desktop bindings narrow and validated. Do not expose broad filesystem, network, or credential APIs to the webview.
4. Keep Jira data normalized at the feature boundary. UI components should consume app-level types, not raw Jira REST response shapes.
5. Add or update Vitest tests with meaningful logic changes. Prefer small, deterministic tests around time tracking, Jira mapping, storage boundaries, and notification scheduling.
6. Keep `src/components/ui/` close to generated Shadcn code. Build product behavior in feature or screen components instead of modifying primitives heavily.

## Verification

- Run `npm run typecheck` after TypeScript changes.
- Run `npm run test:run` after logic changes, bug fixes, and Jira/Deno integration work.
- Run `npm run lint` after behavior or component changes.
- Run `npm run build` before packaging or changing Vite/Deno Desktop integration.
- For Deno Desktop work, use the local `deno-desktop` skill and verify with the appropriate `deno desktop --hmr ...` command when available.
