const APP_NAME = "Jira-Tracking"
const TARGETS = ["macos-arm64", "macos-x64"] as const

type DenoConfig = {
  version?: string
}

function repoPath(...parts: string[]) {
  return new URL(`../${parts.join("/")}`, import.meta.url).pathname
}

function run(
  command: string,
  args: string[],
  options?: { allowFailure?: boolean }
) {
  console.log(`$ ${[command, ...args].join(" ")}`)
  const result = new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).outputSync()

  if (!result.success && !options?.allowFailure) {
    throw new Error(`${command} failed with exit code ${result.code}`)
  }

  return result.success
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

const config = JSON.parse(
  await Deno.readTextFile(repoPath("deno.json"))
) as DenoConfig
const version = config.version

if (!version) {
  throw new Error("deno.json must contain a version before publishing.")
}

const tag = `v${version}`
const releaseDir = repoPath("dist-desktop", "release")
const assets = TARGETS.map(
  (label) => `${releaseDir}/${APP_NAME}-${tag}-${label}.zip`
)

for (const asset of assets) {
  await assertExists(asset)
  run("unzip", ["-t", asset])
}

for (const label of TARGETS) {
  await assertExists(repoPath("dist-desktop", label, `${APP_NAME}.app`))
  run("spctl", [
    "--assess",
    "--type",
    "execute",
    "--verbose",
    repoPath("dist-desktop", label, `${APP_NAME}.app`),
  ])
}

run("gh", ["auth", "status"])

if (run("gh", ["release", "view", tag], { allowFailure: true })) {
  run("gh", ["release", "upload", tag, ...assets, "--clobber"])
} else {
  run("gh", [
    "release",
    "create",
    tag,
    ...assets,
    "--title",
    tag,
    "--generate-notes",
  ])
}

console.log(`Published notarized macOS assets to ${tag}.`)
