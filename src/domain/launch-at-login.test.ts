import { describe, expect, it } from "vitest"

import {
  buildLinuxDesktopEntry,
  buildMacLaunchAgentPlist,
  buildWindowsStartupCmd,
  isEphemeralDesktopRuntime,
  resolveLaunchAtLoginTarget,
  startupRegistrationMatches,
} from "./launch-at-login"

describe("launch-at-login helpers", () => {
  it("treats Deno Desktop HMR / cache runtimes as ephemeral", () => {
    expect(
      isEphemeralDesktopRuntime(
        "/Users/me/Library/Caches/deno/laufey/0.5.0/webview/aarch64-apple-darwin/laufey_webview.app/Contents/MacOS/laufey_webview"
      )
    ).toBe(true)
    expect(
      isEphemeralDesktopRuntime(
        "/Applications/Jira-Tracking.app/Contents/MacOS/laufey_webview",
        "/Users/me/project"
      )
    ).toBe(true)
    expect(
      isEphemeralDesktopRuntime(
        "/Applications/Jira-Tracking.app/Contents/MacOS/laufey_webview"
      )
    ).toBe(false)
  })

  it("resolves a packaged macOS .app launch target via open -gj", () => {
    const target = resolveLaunchAtLoginTarget({
      os: "darwin",
      execPath:
        "/Applications/Jira-Tracking.app/Contents/MacOS/laufey_webview",
      appName: "Jira-Tracking",
      desktopVersion: "0.0.2",
    })

    expect(target).toEqual({
      kind: "macos-app",
      appPath: "/Applications/Jira-Tracking.app",
    })

    const plist = buildMacLaunchAgentPlist({
      label: "de.bergfreunde.jira-tracking",
      appPath: "/Applications/Jira-Tracking.app",
    })

    expect(plist).toContain("<string>/usr/bin/open</string>")
    expect(plist).toContain("<string>-gj</string>")
    expect(plist).toContain(
      "<string>/Applications/Jira-Tracking.app</string>"
    )
    expect(plist).toContain("<string>Aqua</string>")
    expect(
      startupRegistrationMatches(plist, {
        kind: "macos-app",
        appPath: "/Applications/Jira-Tracking.app",
      })
    ).toBe(true)
  })

  it("rejects HMR and non-packaged desktop runs", () => {
    expect(
      resolveLaunchAtLoginTarget({
        os: "darwin",
        execPath:
          "/Users/me/Library/Caches/deno/laufey/0.5.0/webview/aarch64-apple-darwin/laufey_webview.app/Contents/MacOS/laufey_webview",
        appName: "Jira-Tracking",
        desktopVersion: null,
      })
    ).toMatchObject({
      kind: "unsupported",
      message: expect.stringContaining("packaged app"),
    })

    expect(
      resolveLaunchAtLoginTarget({
        os: "darwin",
        execPath:
          "/Applications/Other.app/Contents/MacOS/laufey_webview",
        appName: "Jira-Tracking",
        desktopVersion: "0.0.2",
      })
    ).toMatchObject({ kind: "unsupported" })
  })

  it("builds Windows and Linux startup registrations for packaged binaries", () => {
    const windowsTarget = resolveLaunchAtLoginTarget({
      os: "windows",
      execPath: "C:\\Program Files\\Jira-Tracking\\Jira-Tracking.exe",
      appName: "Jira-Tracking",
      desktopVersion: "0.0.2",
    })
    expect(windowsTarget).toEqual({
      kind: "executable",
      path: "C:\\Program Files\\Jira-Tracking\\Jira-Tracking.exe",
    })

    const cmd = buildWindowsStartupCmd(
      "C:\\Program Files\\Jira-Tracking\\Jira-Tracking.exe"
    )
    expect(cmd).toContain(
      'start "" "C:\\Program Files\\Jira-Tracking\\Jira-Tracking.exe"'
    )
    expect(
      startupRegistrationMatches(cmd, {
        kind: "executable",
        path: "C:\\Program Files\\Jira-Tracking\\Jira-Tracking.exe",
      })
    ).toBe(true)

    const linuxEntry = buildLinuxDesktopEntry({
      appName: "Jira-Tracking",
      executablePath: '/opt/Jira-Tracking/bin/app with "quotes"',
    })
    expect(linuxEntry).toContain(
      'Exec="/opt/Jira-Tracking/bin/app with \\"quotes\\""'
    )
  })

  it("does not treat a stale direct-exec LaunchAgent as enabled", () => {
    const stale = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/Jira-Tracking.app/Contents/MacOS/laufey_webview</string>
  </array>
</dict>
</plist>
`

    expect(
      startupRegistrationMatches(stale, {
        kind: "macos-app",
        appPath: "/Applications/Jira-Tracking.app",
      })
    ).toBe(false)
  })
})
