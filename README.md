# Jira-Tracking

A small tray-first desktop app for logging Jira work quickly. Open the menu-bar/tray panel, find a ticket, add time in 15-minute steps, check recent worklogs, and get reminder notifications without opening a full Jira client.

Built with React, TypeScript, Vite, shadcn/ui, Tailwind CSS, and Deno Desktop.

## Features

- Jira Cloud connection with local-only API token storage.
- Recent ticket lookup and free-text issue search.
- One-click time logging with selected local date and optional note.
- Current-month worklog summary and recent worklog list.
- Persistent app settings for reminders, notifications, launch at login, and shortcut preference.
- Native tray/menu-bar panel behavior for macOS, Windows, and Linux builds.
- Packaged releases for macOS x64/arm64, Windows x64, and Linux x64/arm64.

## Install

Download the latest release from:

```txt
https://github.com/bergthorsten/tracking/releases/latest
```

Choose the artifact for your platform:

- macOS Apple Silicon: `Jira-Tracking-*-macos-arm64.zip`
- macOS Intel: `Jira-Tracking-*-macos-x64.zip`
- Windows: `Jira-Tracking-*-windows-x64.zip`
- Linux x64: `Jira-Tracking-*-linux-x64.tar.gz`
- Linux arm64: `Jira-Tracking-*-linux-arm64.tar.gz`

macOS builds are currently ad-hoc signed by Deno Desktop. For public distribution, Developer ID signing and notarization are still recommended.

## First Run

1. Open the app from the tray/menu bar.
2. Enter your Jira Cloud host, account email, and Jira API token.
3. Create a Jira API token at `https://id.atlassian.com/manage-profile/security/api-tokens` if needed.
4. Search for a ticket or pick a recent one.
5. Log time in 15-minute increments.

Your Jira token is stored by the Deno Desktop backend in the OS app-data/config directory. It is not stored in browser local storage and is not returned to the React renderer.

## Development

Requirements:

- Node.js with npm
- Deno 2.9 or newer with Deno Desktop support

Install dependencies:

```bash
npm install
```

Run the browser mockup gallery:

```bash
npm run dev
```

Run the real tray app in Deno Desktop development mode:

```bash
npm run desktop:dev
```

The production tray UI is served from `/panel` by `desktop/main.ts`. The browser mockup gallery is for design review and should not be treated as the real app runtime.

## Verification

Run these before opening a PR or publishing a build:

```bash
npm run typecheck
npm run test:run
npm run lint
npm run build
deno check --desktop desktop/main.ts
```

`deno check --desktop` is required for Desktop API types. Plain `deno check desktop/main.ts` is not equivalent.

## Packaging

Build the current platform target:

```bash
npm run desktop:package
```

Build all supported targets into architecture-specific folders:

```bash
npm run desktop:package:all
```

Expected all-target outputs:

```txt
dist-desktop/macos-x64/Jira-Tracking.app
dist-desktop/macos-arm64/Jira-Tracking.app
dist-desktop/windows-x64/Jira-Tracking
dist-desktop/linux-x64/Jira-Tracking
dist-desktop/linux-arm64/Jira-Tracking
```

`dist` and `dist-desktop` are ignored by git. Release archives should be created from `dist-desktop` and uploaded to GitHub Releases.

## Auto-Update

The app is wired to Deno Desktop auto-update with this release URL:

```txt
https://github.com/bergthorsten/tracking/releases/latest/download
```

The client checks hourly in packaged desktop builds and stages updates for the next launch. Auto-update requires Deno Desktop `latest.json` manifests and binary patch files to be published with releases. The first public release currently includes full downloadable app archives, but not update patch manifests yet.

Deno Desktop currently documents full staged-update support for macOS and Linux. Treat Windows auto-update as limited until the runtime supports swapping all loaded Windows binaries.

## Desktop Permissions

The desktop tasks keep `--allow-env` scoped to variables needed for app-data discovery and Deno Desktop's runtime serve address. `--allow-read`, `--allow-write`, and `--allow-net` remain broad because Jira hosts are user-configurable, Deno Desktop chooses the loopback port at runtime, bundled assets are served from `dist`, and settings are stored in platform-specific app-data folders. Do not add broader permissions unless a new native feature requires them.

## Project Structure

```txt
desktop/main.ts                 Deno Desktop entrypoint, local API, Jira adapter, native shell features
src/App.tsx                     Browser mockup gallery and real /panel app switch
src/components/tray/            Production tray panel UI
src/components/settings/        Production settings UI
src/components/onboarding/      First-run Jira connection flow
src/components/mockup/          Design/demo-only components
src/components/ui/              shadcn/ui primitives
src/features/desktop-logic.ts   Testable desktop/domain helpers
src/desktop-bindings.ts         Narrow renderer-to-desktop HTTP API wrapper
```

## Contributing

- Keep the app tray-first: fast ticket search, quick time logging, recent worklogs, and reminders are the core loop.
- Do not expose Jira API tokens to React state, logs, screenshots, local storage, or mock data.
- Keep the desktop bridge narrow and validated in `desktop/main.ts` and `src/desktop-bindings.ts`.
- Add Vitest coverage for date/time mapping, Jira payload mapping, cache behavior, settings validation, and reminder scheduling logic.
- Keep generated shadcn/ui primitives minimal; build product behavior in feature and screen components.
- Do not mix mock data into production tray/settings components.

## Useful Commands

```bash
npm run dev                  # Browser mockup gallery
npm run desktop:dev          # Real Deno Desktop tray app with HMR
npm run desktop:package      # Package current target
npm run desktop:package:all  # Package all supported targets
npm run typecheck            # TypeScript check
npm run test:run             # Vitest suite
npm run lint                 # ESLint
npm run build                # Vite production build
```
