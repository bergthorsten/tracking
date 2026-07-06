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
