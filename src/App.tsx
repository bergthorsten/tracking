import * as React from "react"

import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DeviceFrame } from "@/components/mockup/device-frame"
import { TrayApp } from "@/components/tray/tray-app"
import { SettingsScreen } from "@/components/settings/settings-screen"
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen"

type Screen = "tray" | "settings"

/**
 * Mockup gallery. The left card is a fully interactive prototype (Track ↔
 * Worklog ↔ Settings, quick-add toasts, month switch). The right rail shows
 * the onboarding flow. This App is only for design review — the real Deno
 * Desktop entry point will mount <TrayApp /> / <OnboardingScreen /> directly.
 */
export function App() {
  const [screen, setScreen] = React.useState<Screen>("tray")

  return (
    <div className="min-h-svh bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Design mockups
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Jira Time Tracker · menu-bar app
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A fast, keyboard-friendly tray app to log Jira time in 15-minute
            steps. Press{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">
              d
            </kbd>{" "}
            to preview light / dark. The left frame is interactive.
          </p>
        </header>

        <div className="flex flex-wrap items-start justify-center gap-x-14 gap-y-12">
          {/* Interactive prototype */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
              <Button
                size="xs"
                variant={screen === "tray" ? "outline" : "ghost"}
                onClick={() => setScreen("tray")}
              >
                Tray
              </Button>
              <Button
                size="xs"
                variant={screen === "settings" ? "outline" : "ghost"}
                onClick={() => setScreen("settings")}
              >
                Settings
              </Button>
            </div>
            <DeviceFrame label="Interactive prototype">
              {screen === "tray" ? (
                <TrayApp onOpenSettings={() => setScreen("settings")} />
              ) : (
                <SettingsScreen onBack={() => setScreen("tray")} />
              )}
            </DeviceFrame>
          </div>

          {/* Onboarding */}
          <DeviceFrame label="First launch · onboarding">
            <OnboardingScreen />
          </DeviceFrame>
        </div>
      </div>

      <Toaster position="bottom-center" />
    </div>
  )
}

export default App
