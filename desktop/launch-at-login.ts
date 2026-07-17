import type { FeatureStatus } from "../src/contracts/desktop-api.ts"
import {
  buildLinuxDesktopEntry,
  buildMacLaunchAgentPlist,
  buildWindowsStartupCmd,
  resolveLaunchAtLoginTarget,
  startupRegistrationMatches,
  type LaunchAtLoginTarget,
} from "../src/domain/launch-at-login.ts"

const APP_NAME = "Jira-Tracking"
const APP_IDENTIFIER = "de.bergfreunde.jira-tracking"

export type LaunchAtLoginDeps = {
  os?: typeof Deno.build.os
  execPath?: () => string
  desktopVersion?: string | null
  envGet?: (key: string) => string | undefined
  mkdir?: typeof Deno.mkdir
  writeTextFile?: typeof Deno.writeTextFile
  readTextFile?: typeof Deno.readTextFile
  remove?: typeof Deno.remove
  stat?: typeof Deno.stat
  runLaunchctl?: (args: string[]) => Promise<void>
  uid?: () => number | null
}

function currentTarget(deps: LaunchAtLoginDeps = {}): LaunchAtLoginTarget {
  const os = deps.os ?? Deno.build.os
  const execPath = deps.execPath ?? (() => Deno.execPath())
  const envGet = deps.envGet ?? ((key) => Deno.env.get(key))
  const desktopVersion =
    deps.desktopVersion === undefined
      ? typeof Deno.desktopVersion === "string"
        ? Deno.desktopVersion
        : null
      : deps.desktopVersion

  return resolveLaunchAtLoginTarget({
    os,
    execPath: execPath(),
    appName: APP_NAME,
    desktopVersion,
    hmrProjectRoot: envGet("DENO_DESKTOP_HMR") ?? null,
  })
}

export function startupFilePath(
  os: typeof Deno.build.os = Deno.build.os,
  envGet: (key: string) => string | undefined = (key) => Deno.env.get(key)
) {
  const home = envGet("HOME") ?? envGet("USERPROFILE")

  if (os === "darwin") {
    if (!home) {
      throw new Error("Could not find your home directory.")
    }

    return `${home}/Library/LaunchAgents/${APP_IDENTIFIER}.plist`
  }

  if (os === "windows") {
    const appData = envGet("APPDATA")

    if (!appData) {
      throw new Error("Could not find the Windows Startup folder.")
    }

    return `${appData}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\${APP_NAME}.cmd`
  }

  if (os === "linux") {
    if (!home) {
      throw new Error("Could not find your home directory.")
    }

    const configHome = envGet("XDG_CONFIG_HOME") ?? `${home}/.config`
    return `${configHome}/autostart/${APP_IDENTIFIER}.desktop`
  }

  return null
}

async function pathExists(
  path: string,
  stat: typeof Deno.stat = Deno.stat
) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false
    }

    throw error
  }
}

async function readRegistrationContent(
  path: string,
  readTextFile: typeof Deno.readTextFile = Deno.readTextFile
) {
  try {
    return await readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null
    }

    throw error
  }
}

async function ensureParentDir(
  path: string,
  os: typeof Deno.build.os,
  mkdir: typeof Deno.mkdir = Deno.mkdir
) {
  const separator = os === "windows" ? "\\" : "/"
  const parent = path.slice(0, path.lastIndexOf(separator))

  if (parent) {
    await mkdir(parent, { recursive: true })
  }
}

async function removeRegistration(
  path: string,
  remove: typeof Deno.remove = Deno.remove
) {
  try {
    await remove(path)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error
    }
  }
}

async function defaultRunLaunchctl(args: string[]) {
  const result = await new Deno.Command("launchctl", {
    args,
    stdout: "null",
    stderr: "null",
  }).output()

  // bootout returns non-zero when the agent is not loaded; that is fine.
  if (!result.success && args[0] !== "bootout") {
    throw new Error(`launchctl ${args[0]} failed (${result.code})`)
  }
}

async function resolveUserId(deps: LaunchAtLoginDeps) {
  if (deps.uid) {
    return deps.uid()
  }

  try {
    const result = await new Deno.Command("id", {
      args: ["-u"],
      stdout: "piped",
      stderr: "null",
    }).output()

    if (!result.success) {
      return null
    }

    const uid = Number(new TextDecoder().decode(result.stdout).trim())
    return Number.isInteger(uid) ? uid : null
  } catch {
    return null
  }
}

async function unloadMacLaunchAgent(path: string, deps: LaunchAtLoginDeps) {
  const runLaunchctl = deps.runLaunchctl ?? defaultRunLaunchctl
  const uid = await resolveUserId(deps)

  if (uid === null) {
    return
  }

  try {
    await runLaunchctl(["bootout", `gui/${uid}`, path])
  } catch {
    // Best effort: deleting the plist is enough for the next login.
  }
}

function buildRegistrationContent(
  os: typeof Deno.build.os,
  target: Exclude<LaunchAtLoginTarget, { kind: "unsupported" }>
) {
  if (target.kind === "macos-app") {
    return buildMacLaunchAgentPlist({
      label: APP_IDENTIFIER,
      appPath: target.appPath,
    })
  }

  if (os === "windows") {
    return buildWindowsStartupCmd(target.path)
  }

  return buildLinuxDesktopEntry({
    appName: APP_NAME,
    executablePath: target.path,
  })
}

function isBrokenEphemeralRegistration(content: string) {
  const normalized = content.replaceAll("\\", "/")
  return (
    normalized.includes("laufey_webview") ||
    normalized.includes("/Caches/deno/") ||
    normalized.includes("/.cache/deno/")
  )
}

export async function getLaunchAtLoginStatus(
  deps: LaunchAtLoginDeps = {}
): Promise<FeatureStatus> {
  const os = deps.os ?? Deno.build.os
  const envGet = deps.envGet ?? ((key) => Deno.env.get(key))
  const path = startupFilePath(os, envGet)
  const target = currentTarget(deps)

  if (!path) {
    return {
      supported: false,
      enabled: false,
      message: "Launch at login is not supported on this platform.",
    }
  }

  if (target.kind === "unsupported") {
    const stale = await pathExists(path, deps.stat)

    return {
      supported: false,
      enabled: false,
      message: stale
        ? `${target.message} Open the packaged app to clear a leftover login item.`
        : target.message,
    }
  }

  const content = await readRegistrationContent(path, deps.readTextFile)

  if (!content) {
    return { supported: true, enabled: false }
  }

  return {
    supported: true,
    enabled: startupRegistrationMatches(content, target),
  }
}

export async function setLaunchAtLogin(
  enabled: unknown,
  deps: LaunchAtLoginDeps = {}
): Promise<FeatureStatus> {
  if (typeof enabled !== "boolean") {
    throw new TypeError("Choose whether to launch at login.")
  }

  const os = deps.os ?? Deno.build.os
  const envGet = deps.envGet ?? ((key) => Deno.env.get(key))
  const path = startupFilePath(os, envGet)
  const target = currentTarget(deps)

  if (!path) {
    throw new Error("Launch at login is not supported on this platform.")
  }

  if (target.kind === "unsupported") {
    throw new Error(target.message)
  }

  if (!enabled) {
    if (os === "darwin") {
      await unloadMacLaunchAgent(path, deps)
    }

    await removeRegistration(path, deps.remove)
    return getLaunchAtLoginStatus(deps)
  }

  const content = buildRegistrationContent(os, target)
  await ensureParentDir(path, os, deps.mkdir)
  await (deps.writeTextFile ?? Deno.writeTextFile)(path, content)

  // Do not bootstrap with RunAtLoad — that would spawn a second instance now.
  // Writing into ~/Library/LaunchAgents is enough for the next login session.

  return getLaunchAtLoginStatus(deps)
}

export async function syncLaunchAtLoginRegistration(options: {
  preferEnabled: boolean
  deps?: LaunchAtLoginDeps
}): Promise<FeatureStatus> {
  const deps = options.deps ?? {}
  const os = deps.os ?? Deno.build.os
  const envGet = deps.envGet ?? ((key) => Deno.env.get(key))
  const path = startupFilePath(os, envGet)
  const target = currentTarget(deps)

  if (!path) {
    return {
      supported: false,
      enabled: false,
      message: "Launch at login is not supported on this platform.",
    }
  }

  // HMR / unpackaged runs must not keep a broken ephemeral registration around.
  if (target.kind === "unsupported") {
    const content = await readRegistrationContent(path, deps.readTextFile)

    if (content && isBrokenEphemeralRegistration(content)) {
      if (os === "darwin") {
        await unloadMacLaunchAgent(path, deps)
      }

      await removeRegistration(path, deps.remove)
    }

    return getLaunchAtLoginStatus(deps)
  }

  if (!options.preferEnabled) {
    return getLaunchAtLoginStatus(deps)
  }

  // Rewrite so moved/updated installs keep pointing at the current app path.
  return setLaunchAtLogin(true, deps)
}
