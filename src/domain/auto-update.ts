export const AUTO_UPDATE_REPO = "bergthorsten/tracking"
export const AUTO_UPDATE_APP_NAME = "Jira-Tracking"
export const AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000

export type AutoUpdatePlatformLabel =
  | "macos-arm64"
  | "macos-x64"
  | "windows-x64"
  | "linux-x64"
  | "linux-arm64"

export type AutoUpdateReleaseAsset = {
  name: string
  browser_download_url: string
}

export type AutoUpdateRelease = {
  tag_name: string
  assets: AutoUpdateReleaseAsset[]
}

export function normalizeReleaseVersion(tag: string) {
  const trimmed = tag.trim()
  return trimmed.startsWith("v") || trimmed.startsWith("V")
    ? trimmed.slice(1)
    : trimmed
}

export function parseSemver(version: string) {
  const match = version
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)

  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function isNewerVersion(latest: string, current: string) {
  const left = parseSemver(latest)
  const right = parseSemver(current)

  if (!left || !right) {
    return latest !== current
  }

  if (left.major !== right.major) {
    return left.major > right.major
  }

  if (left.minor !== right.minor) {
    return left.minor > right.minor
  }

  return left.patch > right.patch
}

export function platformLabelFor(
  os: string,
  arch: string
): AutoUpdatePlatformLabel | null {
  if (os === "darwin" && arch === "aarch64") {
    return "macos-arm64"
  }

  if (os === "darwin" && arch === "x86_64") {
    return "macos-x64"
  }

  if (os === "windows" && arch === "x86_64") {
    return "windows-x64"
  }

  if (os === "linux" && arch === "x86_64") {
    return "linux-x64"
  }

  if (os === "linux" && arch === "aarch64") {
    return "linux-arm64"
  }

  return null
}

export function releaseAssetName(
  version: string,
  platform: AutoUpdatePlatformLabel
) {
  const extension =
    platform.startsWith("linux-") ? "tar.gz" : "zip"

  return `${AUTO_UPDATE_APP_NAME}-v${version}-${platform}.${extension}`
}

export function findReleaseAsset(
  release: AutoUpdateRelease,
  platform: AutoUpdatePlatformLabel
) {
  const version = normalizeReleaseVersion(release.tag_name)
  const expected = releaseAssetName(version, platform)

  return (
    release.assets.find((asset) => asset.name === expected) ?? null
  )
}

export function macAppBundlePathFromExecPath(execPath: string) {
  const normalized = execPath.replaceAll("\\", "/")
  const marker = ".app/Contents/MacOS/"
  const index = normalized.lastIndexOf(marker)

  if (index === -1) {
    return null
  }

  return `${normalized.slice(0, index + 4)}`
}
