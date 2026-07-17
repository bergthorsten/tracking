import { macAppBundlePathFromExecPath } from "./auto-update.ts"

export type LaunchAtLoginOs = "darwin" | "windows" | "linux" | string

export type LaunchAtLoginTarget =
  | {
      kind: "macos-app"
      appPath: string
    }
  | {
      kind: "executable"
      path: string
    }
  | {
      kind: "unsupported"
      message: string
    }

export type LaunchAtLoginResolveInput = {
  os: LaunchAtLoginOs
  execPath: string
  appName: string
  desktopVersion: string | null
  hmrProjectRoot?: string | null
}

const UNSUPPORTED_DEV_MESSAGE =
  "Launch at login only works in the packaged app, not during desktop:dev."

const UNSUPPORTED_PLATFORM_MESSAGE =
  "Launch at login is not supported on this platform."

const UNSUPPORTED_LAYOUT_MESSAGE =
  "Launch at login needs a packaged app install."

export function isEphemeralDesktopRuntime(
  execPath: string,
  hmrProjectRoot?: string | null
) {
  if (typeof hmrProjectRoot === "string" && hmrProjectRoot.length > 0) {
    return true
  }

  const normalized = execPath.replaceAll("\\", "/")
  return (
    normalized.includes("/Caches/deno/laufey/") ||
    normalized.includes("/.cache/deno/laufey/") ||
    normalized.includes("/deno/laufey/") ||
    normalized.includes("laufey_webview.app/")
  )
}

export function resolveLaunchAtLoginTarget(
  input: LaunchAtLoginResolveInput
): LaunchAtLoginTarget {
  if (input.os !== "darwin" && input.os !== "windows" && input.os !== "linux") {
    return {
      kind: "unsupported",
      message: UNSUPPORTED_PLATFORM_MESSAGE,
    }
  }

  if (isEphemeralDesktopRuntime(input.execPath, input.hmrProjectRoot)) {
    return {
      kind: "unsupported",
      message: UNSUPPORTED_DEV_MESSAGE,
    }
  }

  if (input.desktopVersion === null) {
    return {
      kind: "unsupported",
      message: UNSUPPORTED_LAYOUT_MESSAGE,
    }
  }

  if (input.os === "darwin") {
    const appPath = macAppBundlePathFromExecPath(input.execPath)

    if (!appPath) {
      return {
        kind: "unsupported",
        message: UNSUPPORTED_LAYOUT_MESSAGE,
      }
    }

    const appFileName = appPath.replaceAll("\\", "/").split("/").at(-1) ?? ""

    if (appFileName !== `${input.appName}.app`) {
      return {
        kind: "unsupported",
        message: UNSUPPORTED_LAYOUT_MESSAGE,
      }
    }

    return { kind: "macos-app", appPath }
  }

  return { kind: "executable", path: input.execPath }
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function quoteLinuxExec(value: string) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`
}

export function buildMacLaunchAgentPlist(options: {
  label: string
  appPath: string
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-gj</string>
    <string>${escapeXml(options.appPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
</dict>
</plist>
`
}

export function buildWindowsStartupCmd(executablePath: string) {
  return `@echo off\r\nstart "" "${executablePath.replace(/"/g, '""')}"\r\n`
}

export function buildLinuxDesktopEntry(options: {
  appName: string
  executablePath: string
}) {
  return `[Desktop Entry]
Type=Application
Name=${options.appName}
Exec=${quoteLinuxExec(options.executablePath)}
X-GNOME-Autostart-enabled=true
NoDisplay=false
Terminal=false
`
}

export function startupRegistrationMatches(
  content: string,
  target: Exclude<LaunchAtLoginTarget, { kind: "unsupported" }>
) {
  if (target.kind === "macos-app") {
    return (
      content.includes("/usr/bin/open") &&
      content.includes("-gj") &&
      content.includes(target.appPath)
    )
  }

  return content.includes(target.path)
}
