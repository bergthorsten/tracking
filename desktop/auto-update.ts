import {
  AUTO_UPDATE_APP_NAME,
  AUTO_UPDATE_INTERVAL_MS,
  AUTO_UPDATE_REPO,
  findReleaseAsset,
  isNewerVersion,
  macAppBundlePathFromExecPath,
  normalizeReleaseVersion,
  platformLabelFor,
  type AutoUpdateRelease,
} from "../src/domain/auto-update.ts"

type FetchLike = typeof fetch

type AutoUpdateOptions = {
  currentVersion: string
  settingsDir: string
  fetch?: FetchLike
  intervalMs?: number
  onUpdateReady?: (version: string) => void
  onError?: (error: unknown) => void
}

type StagedUpdate = {
  version: string
  stagedPath: string
  installRoot: string
  platform: string
}

function joinPath(...parts: string[]) {
  const separator = Deno.build.os === "windows" ? "\\" : "/"
  return parts
    .filter((part) => part.length > 0)
    .join(separator)
    .replaceAll(/[\\/]+/g, separator)
}

async function ensureDir(path: string) {
  await Deno.mkdir(path, { recursive: true })
}

async function pathExists(path: string) {
  try {
    await Deno.stat(path)
    return true
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false
    }

    throw error
  }
}

async function removePath(path: string) {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error
    }
  })
}

function run(command: string, args: string[]) {
  const result = new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).outputSync()

  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim()
    throw new Error(
      `${command} failed (${result.code})${stderr ? `: ${stderr}` : ""}`
    )
  }
}

async function downloadFile(
  url: string,
  destination: string,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": AUTO_UPDATE_APP_NAME,
    },
  })

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  await Deno.writeFile(destination, bytes)
}

async function extractArchive(archivePath: string, destinationDir: string) {
  await ensureDir(destinationDir)

  if (archivePath.endsWith(".tar.gz")) {
    run("tar", ["-xzf", archivePath, "-C", destinationDir])
    return
  }

  if (Deno.build.os === "darwin") {
    run("ditto", ["-x", "-k", archivePath, destinationDir])
    return
  }

  run("unzip", ["-qo", archivePath, "-d", destinationDir])
}

function resolveInstallRoot() {
  if (Deno.build.os === "darwin") {
    const bundle = macAppBundlePathFromExecPath(Deno.execPath())

    if (!bundle) {
      throw new Error("Could not locate the macOS .app bundle for updating.")
    }

    return bundle
  }

  // Packaged Linux/Windows layouts keep the launcher next to runtime files.
  const execPath = Deno.execPath().replaceAll("\\", "/")
  const slash = execPath.lastIndexOf("/")

  if (slash === -1) {
    throw new Error("Could not locate the install directory for updating.")
  }

  return Deno.build.os === "windows"
    ? execPath.slice(0, slash).replaceAll("/", "\\")
    : execPath.slice(0, slash)
}

async function findStagedApp(extractDir: string, platform: string) {
  if (platform.startsWith("macos-")) {
    const appPath = joinPath(extractDir, `${AUTO_UPDATE_APP_NAME}.app`)

    if (await pathExists(appPath)) {
      return appPath
    }

    throw new Error("Extracted macOS update is missing Jira-Tracking.app")
  }

  // Linux/Windows archives extract a folder of the same app name, or flat files.
  const nested = joinPath(extractDir, AUTO_UPDATE_APP_NAME)

  if (await pathExists(nested)) {
    return nested
  }

  return extractDir
}

function writeMacInstallScript(scriptPath: string) {
  const script = `#!/bin/bash
set -euo pipefail
trap '' HUP
PID="$1"
APP_PATH="$2"
STAGED_APP="$3"
LOG_FILE="$4"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >> "$LOG_FILE"
}

log "Waiting for pid $PID to exit"
while kill -0 "$PID" 2>/dev/null; do
  sleep 0.2
done
sleep 0.4

log "Replacing $APP_PATH"
rm -rf "$APP_PATH"
mv "$STAGED_APP" "$APP_PATH"
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

log "Launching updated app"
open "$APP_PATH"
log "Update complete"
`

  Deno.writeTextFileSync(scriptPath, script)
  run("chmod", ["+x", scriptPath])
}

function writeGenericInstallScript(scriptPath: string) {
  const script = `#!/bin/bash
set -euo pipefail
trap '' HUP
PID="$1"
INSTALL_ROOT="$2"
STAGED="$3"
LOG_FILE="$4"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >> "$LOG_FILE"
}

log "Waiting for pid $PID to exit"
while kill -0 "$PID" 2>/dev/null; do
  sleep 0.2
done
sleep 0.4

log "Replacing $INSTALL_ROOT"
rm -rf "$INSTALL_ROOT"
mkdir -p "$(dirname "$INSTALL_ROOT")"
mv "$STAGED" "$INSTALL_ROOT"

log "Update complete; relaunch manually if needed"
`

  Deno.writeTextFileSync(scriptPath, script)
  run("chmod", ["+x", scriptPath])
}

export function createAutoUpdater(options: AutoUpdateOptions) {
  const fetchImpl = options.fetch ?? fetch
  const intervalMs = options.intervalMs ?? AUTO_UPDATE_INTERVAL_MS
  const updateRoot = joinPath(options.settingsDir, "updates")
  const stageMetaPath = joinPath(updateRoot, "staged-update.json")
  let staged: StagedUpdate | null = null
  let checking = false
  let timer: ReturnType<typeof setInterval> | null = null

  async function readStaged(): Promise<StagedUpdate | null> {
    try {
      const text = await Deno.readTextFile(stageMetaPath)
      const parsed = JSON.parse(text) as StagedUpdate

      if (
        typeof parsed.version === "string" &&
        typeof parsed.stagedPath === "string" &&
        typeof parsed.installRoot === "string" &&
        typeof parsed.platform === "string" &&
        (await pathExists(parsed.stagedPath))
      ) {
        return parsed
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        options.onError?.(error)
      }
    }

    return null
  }

  async function writeStaged(next: StagedUpdate) {
    await ensureDir(updateRoot)
    await Deno.writeTextFile(stageMetaPath, `${JSON.stringify(next, null, 2)}\n`)
    staged = next
  }

  async function clearStaged() {
    staged = null
    await removePath(stageMetaPath)
    await removePath(joinPath(updateRoot, "staging"))
    await removePath(joinPath(updateRoot, "download"))
  }

  async function fetchLatestRelease(): Promise<AutoUpdateRelease> {
    const response = await fetchImpl(
      `https://api.github.com/repos/${AUTO_UPDATE_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": AUTO_UPDATE_APP_NAME,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`GitHub latest release lookup failed (${response.status})`)
    }

    return (await response.json()) as AutoUpdateRelease
  }

  async function stageRelease(release: AutoUpdateRelease) {
    const platform = platformLabelFor(Deno.build.os, Deno.build.arch)

    if (!platform) {
      throw new Error(
        `Auto-update is not supported on ${Deno.build.os}/${Deno.build.arch}`
      )
    }

    const version = normalizeReleaseVersion(release.tag_name)
    const asset = findReleaseAsset(release, platform)

    if (!asset) {
      throw new Error(
        `Release ${release.tag_name} has no asset for ${platform}`
      )
    }

    const downloadDir = joinPath(updateRoot, "download")
    const extractDir = joinPath(updateRoot, "staging", version)
    const archivePath = joinPath(downloadDir, asset.name)

    await removePath(downloadDir)
    await removePath(joinPath(updateRoot, "staging"))
    await ensureDir(downloadDir)
    await downloadFile(asset.browser_download_url, archivePath, fetchImpl)
    await extractArchive(archivePath, extractDir)

    const stagedPath = await findStagedApp(extractDir, platform)
    const installRoot = resolveInstallRoot()

    await writeStaged({
      version,
      stagedPath,
      installRoot,
      platform,
    })

    return version
  }

  async function checkForUpdate() {
    if (checking) {
      return
    }

    checking = true

    try {
      if (!staged) {
        staged = await readStaged()
      }

      if (staged && isNewerVersion(staged.version, options.currentVersion)) {
        options.onUpdateReady?.(staged.version)
        return
      }

      const release = await fetchLatestRelease()
      const latest = normalizeReleaseVersion(release.tag_name)

      if (!isNewerVersion(latest, options.currentVersion)) {
        if (staged) {
          await clearStaged()
        }
        return
      }

      if (staged?.version === latest) {
        options.onUpdateReady?.(latest)
        return
      }

      const version = await stageRelease(release)
      options.onUpdateReady?.(version)
    } catch (error) {
      options.onError?.(error)
    } finally {
      checking = false
    }
  }

  function applyStagedUpdateAndExit() {
    if (!staged) {
      return false
    }

    const logFile = joinPath(updateRoot, "install.log")
    const scriptPath = joinPath(updateRoot, "apply-update.sh")
    const pid = String(Deno.pid)

    if (Deno.build.os === "darwin") {
      writeMacInstallScript(scriptPath)
    } else if (Deno.build.os === "linux") {
      writeGenericInstallScript(scriptPath)
    } else {
      // Windows: full replacement helper is not automated yet; keep the archive staged.
      console.warn(
        "[desktop] staged Windows update is ready; replace the install folder manually after quitting"
      )
      return false
    }

    const command = new Deno.Command(scriptPath, {
      args: [pid, staged.installRoot, staged.stagedPath, logFile],
      stdout: "null",
      stderr: "null",
      stdin: "null",
    })

    command.spawn()
    console.log(
      `[desktop] applying staged update ${staged.version}; exiting for install`
    )
    Deno.exit(0)
  }

  return {
    async start() {
      await ensureDir(updateRoot)
      staged = await readStaged()
      await checkForUpdate()
      timer = setInterval(() => {
        void checkForUpdate()
      }, intervalMs)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    hasStagedUpdate() {
      return staged !== null
    },
    stagedVersion() {
      return staged?.version ?? null
    },
    applyStagedUpdateAndExit,
    checkForUpdate,
  }
}
