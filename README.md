# Tracking

React, TypeScript, Vite, shadcn/ui, and Deno Desktop.

## Desktop app

Install Deno 2.9 or newer, then run the tray/menu-bar app in development mode:

```bash
deno task desktop:dev
```

Package the current production build into a desktop app:

```bash
deno task desktop:package
```

Equivalent npm scripts are also available:

```bash
npm run desktop:dev
npm run desktop:package
```

The Desktop entry hides the startup window, hides the macOS dock icon, and attaches the app UI as a tray/menu-bar panel.

## Desktop permissions

The desktop tasks keep `--allow-env` scoped to the variables needed for app-data discovery and Deno Desktop's runtime serve address. `--allow-read`, `--allow-write`, and `--allow-net` remain broad because Jira hosts are user-configurable, Deno Desktop chooses the loopback port at runtime, bundled assets are served from `dist`, and settings are stored in platform-specific app-data folders. Do not add broader permissions unless a new native feature requires them.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
