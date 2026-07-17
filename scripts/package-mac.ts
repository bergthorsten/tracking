const APP_NAME = "Jira-Tracking"
const APP_BUNDLE_NAME = `${APP_NAME}.app`
const REQUIRED_ENV = [
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
] as const

const TARGETS = [
  { target: "aarch64-apple-darwin", label: "macos-arm64" },
  { target: "x86_64-apple-darwin", label: "macos-x64" },
] as const

type DenoConfig = {
  version?: string
  desktop?: {
    macos?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

function repoPath(...parts: string[]) {
  return new URL(`../${parts.join("/")}`, import.meta.url).pathname
}

async function loadDotEnv() {
  let text: string

  try {
    text = await Deno.readTextFile(repoPath(".env"))
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return
    }

    throw error
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (!key || Deno.env.has(key)) {
      continue
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    Deno.env.set(key, value)
  }
}

function requireEnv(name: (typeof REQUIRED_ENV)[number]) {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing macOS release environment variable: ${name}`)
  }

  return value
}

function run(command: string, args: string[], logArgs = args) {
  console.log(`$ ${[command, ...logArgs].join(" ")}`)
  const result = new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).outputSync()

  if (!result.success) {
    throw new Error(`${command} failed with exit code ${result.code}`)
  }
}

async function createSigningConfig(codesignIdentity: string) {
  const config = JSON.parse(
    await Deno.readTextFile(repoPath("deno.json"))
  ) as DenoConfig
  config.desktop = {
    ...config.desktop,
    macos: {
      ...config.desktop?.macos,
      codesignIdentity,
    },
  }

  const path = await Deno.makeTempFile({
    dir: repoPath(),
    prefix: "jira-tracking-deno-",
    suffix: ".json",
  })
  await Deno.writeTextFile(path, `${JSON.stringify(config, null, 2)}\n`)

  return { path, version: config.version }
}

async function recreateDir(path: string) {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error
    }
  })
  await Deno.mkdir(path, { recursive: true })
}

async function assertExists(path: string) {
  try {
    await Deno.stat(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Expected artifact missing: ${path}`, { cause: error })
    }

    throw error
  }
}

async function codesignFileIfExists(path: string, codesignIdentity: string) {
  try {
    await Deno.stat(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return
    }

    throw error
  }

  run("codesign", [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    codesignIdentity,
    path,
  ])
}

async function codesignAppBundle(appPath: string, codesignIdentity: string) {
  const runtimeUpdateMarker = `${appPath}/Contents/MacOS/libruntime.dylib.update-ok`

  await Deno.writeTextFile(
    runtimeUpdateMarker,
    "ok"
  )
  await codesignFileIfExists(runtimeUpdateMarker, codesignIdentity)
  await codesignFileIfExists(
    `${appPath}/Contents/MacOS/libruntime.dylib`,
    codesignIdentity
  )
  run("codesign", [
    "--force",
    "--options",
    "runtime",
    "--entitlements",
    entitlementsPath,
    "--timestamp",
    "--sign",
    codesignIdentity,
    appPath,
  ])
}

await loadDotEnv()

if (Deno.build.os !== "darwin") {
  throw new Error("macOS signing and notarization must run on macOS.")
}

for (const name of REQUIRED_ENV) {
  requireEnv(name)
}

const codesignIdentity = requireEnv("APPLE_SIGNING_IDENTITY")
const appleId = requireEnv("APPLE_ID")
const applePassword = requireEnv("APPLE_APP_SPECIFIC_PASSWORD")
const teamId = requireEnv("APPLE_TEAM_ID")
const denoConfig = await createSigningConfig(codesignIdentity)
const releaseVersion = `v${denoConfig.version ?? "0.0.0"}`
const releaseDir = repoPath("dist-desktop", "release")
const entitlementsPath = repoPath("desktop", "macos-entitlements.plist")

try {
  run("npm", ["run", "build"])
  await recreateDir(releaseDir)

  for (const { target, label } of TARGETS) {
    const outputDir = repoPath("dist-desktop", label)
    const appPath = `${outputDir}/${APP_BUNDLE_NAME}`
    const submitZipPath = `${releaseDir}/${APP_NAME}-${label}-notary-submit.zip`
    const releaseZipPath = `${releaseDir}/${APP_NAME}-${releaseVersion}-${label}.zip`

    await recreateDir(outputDir)
    run("deno", [
      "desktop",
      "--config",
      denoConfig.path,
      "--target",
      target,
      "--output",
      appPath,
      "--allow-env=HOME,USERPROFILE,APPDATA,LOCALAPPDATA,XDG_CONFIG_HOME,DENO_SERVE_ADDRESS",
      "--allow-read",
      "--allow-write",
      "--allow-net",
      "--allow-run",
      "--include",
      "dist",
      "--exclude",
      "node_modules",
      "desktop/main.ts",
    ])

    await assertExists(appPath)
    await codesignAppBundle(appPath, codesignIdentity)
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath])
    run("ditto", ["-c", "-k", "--keepParent", appPath, submitZipPath])
    run(
      "xcrun",
      [
        "notarytool",
        "submit",
        submitZipPath,
        "--apple-id",
        appleId,
        "--password",
        applePassword,
        "--team-id",
        teamId,
        "--wait",
      ],
      [
        "notarytool",
        "submit",
        submitZipPath,
        "--apple-id",
        appleId,
        "--password",
        "<redacted>",
        "--team-id",
        teamId,
        "--wait",
      ]
    )
    run("xcrun", ["stapler", "staple", appPath])
    run("spctl", ["--assess", "--type", "execute", "--verbose", appPath])

    await Deno.remove(submitZipPath)
    run("ditto", ["-c", "-k", "--keepParent", appPath, releaseZipPath])
    console.log(`Created notarized release archive: ${releaseZipPath}`)
  }
} finally {
  await Deno.remove(denoConfig.path).catch(() => {})
}
