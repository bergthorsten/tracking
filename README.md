# Jira-Tracking

A small desktop app for logging Jira work quickly. On Windows it opens as a normal application window; on macOS and Linux, open the menu-bar/tray panel. Find a ticket, add time in 15-minute steps, check recent worklogs, and get reminder notifications without opening a full Jira client.

Built with React, TypeScript, Vite, shadcn/ui, Tailwind CSS, and Deno Desktop.

## Features

- Jira Cloud connection with local-only API token storage.
- Recent ticket lookup and free-text issue search.
- One-click time logging with selected local date and optional note.
- Current-month worklog summary and recent worklog list.
- Persistent app settings for reminders, notifications, and launch at login.
- Native tray/menu-bar access for macOS, Windows, and Linux builds; Windows also opens a standard app window at launch.
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

macOS release builds should be Developer ID signed and notarized so Gatekeeper allows smoother first-run installation. See `docs/mac-signing-notarization.md`.

## First Run

1. On Windows, use the app window that opens at launch. On macOS and Linux, open the app from the tray/menu bar.
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

Build signed and notarized macOS release archives from a trusted Mac:

```bash
npm run desktop:package:mac
npm run desktop:publish:mac
```

Packaging requires Apple signing variables in `.env`; copy `.env.example` and fill in the real values first. Publishing requires `gh` to be authenticated with release write access.

Expected all-target outputs:

```txt
dist-desktop/macos-x64/Jira-Tracking.app
dist-desktop/macos-arm64/Jira-Tracking.app
dist-desktop/windows-x64/Jira-Tracking
dist-desktop/linux-x64/Jira-Tracking
dist-desktop/linux-arm64/Jira-Tracking
```

Expected notarized macOS release outputs:

```txt
dist-desktop/release/Jira-Tracking-v0.0.2-macos-arm64.zip
dist-desktop/release/Jira-Tracking-v0.0.2-macos-x64.zip
```

`dist` and `dist-desktop` are ignored by git. Release archives should be created from `dist-desktop` and uploaded to GitHub Releases.

## Auto-Update

Packaged builds poll GitHub Releases hourly and download the full platform archive for the newer version. On macOS and Linux, quitting the app replaces the install with the staged build and relaunches (macOS).

This intentionally does **not** use [`Deno.autoUpdate()`](https://docs.deno.com/runtime/desktop/auto_update/) on signed macOS builds. That API applies a `bsdiff` patch to `libruntime.dylib` inside the `.app` bundle, which breaks the Developer ID / notarization seal Gatekeeper expects. Full ZIP replacement keeps the notarized signature intact.

Release URL / assets:

```txt
https://github.com/bergthorsten/tracking/releases/latest
Jira-Tracking-v<version>-macos-arm64.zip
Jira-Tracking-v<version>-macos-x64.zip
Jira-Tracking-v<version>-windows-x64.zip
Jira-Tracking-v<version>-linux-x64.tar.gz
Jira-Tracking-v<version>-linux-arm64.tar.gz
```

Windows can stage a download but does not auto-replace the install directory yet. Dev runs keep `--disable-auto-update`.

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

- Keep macOS and Linux tray-first; on Windows, open the normal app window at launch. Fast ticket search, quick time logging, recent worklogs, and reminders are the core loop.
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
npm run desktop:package:mac  # Build signed/notarized macOS ZIPs
npm run desktop:publish:mac  # Upload notarized macOS ZIPs to GitHub Releases
npm run desktop:package:all  # Package all supported targets
npm run typecheck            # TypeScript check
npm run test:run             # Vitest suite
npm run lint                 # ESLint
npm run build                # Vite production build
```
