const PANEL_WIDTH = 400
const PANEL_HEIGHT = 600
const APP_NAME = "Jira-Tracking"
const SETTINGS_FILE = "jira-settings.json"
const JIRA_SETTINGS_API_PATH = "/api/jira-settings"
const JIRA_PROFILE_API_PATH = "/api/jira-profile"
const JIRA_ISSUES_API_PATH = "/api/jira-issues"
const JIRA_WORKLOGS_API_PATH = "/api/jira-worklogs"
const SHOW_PANEL_ON_START = Deno.args.includes("--show-panel")
const TRAY_ICON_LIGHT =
  "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAWUlEQVR4nGNgGEDwHwcenAbjMpQiwwkZSpbh2DSii5FsOC7FuAwiynB8riBkMF7D8SkgxtLBazDJKWRADCbGcLINJlsfOTmKaD3kGkw1V1ClvKB7CTcKCAMAXSiKdkMrOMkAAAAASUVORK5CYII="
const TRAY_ICON_DARK =
  "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAZUlEQVR4nNWTWwoAIAgEu/+l7T9anRUCW/AndHykKyLWCyNOSjPBlVpgKgt8CzzfUngGJcmkPw0m4CBgOh4ZNw6sNAtsHYwLrhK21o100ToQXK0C08pTH9oi+jAKtrbABbftP/AGh98xJAE7q00AAAAASUVORK5CYII="

const distRoot = new URL("../dist/", import.meta.url)

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

interface JiraSettingsInput {
  host: string
  email: string
  token: string
}

interface StoredJiraSettings extends JiraSettingsInput {
  accountId?: string
  avatarUrl?: string
  displayName?: string
  updatedAt: string
}

interface PublicJiraSettings {
  [key: string]: unknown
  host: string
  email: string
  accountId?: string
  avatarUrl?: string
  displayName?: string
  updatedAt: string
}

interface JiraProfile {
  accountId?: string
  avatarUrls?: Record<string, string>
  displayName?: string
}

interface JiraIssue {
  id?: string
  key: string
  fields?: {
    summary?: string
    updated?: string
  }
}

interface JiraSearchResponse {
  issues?: JiraIssue[]
  nextPageToken?: string
}

interface PublicJiraTicket {
  key: string
  title: string
  project: string
  todayMinutes: number
  lastWorked: string
}

interface JiraWorklogResponse {
  maxResults?: number
  total?: number
  worklogs?: JiraWorklog[]
}

interface JiraWorklog {
  id: string
  author?: {
    accountId?: string
  }
  comment?: unknown
  started?: string
  timeSpentSeconds?: number
}

interface PublicWorklog {
  id: string
  ticketKey: string
  ticketTitle: string
  minutes: number
  startedAt: string
  description?: string
}

interface WorklogRange {
  start: Date
  end: Date
}

function appDataDir() {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE")

  if (Deno.build.os === "windows") {
    const root = Deno.env.get("APPDATA") ?? Deno.env.get("LOCALAPPDATA") ?? home

    if (!root) {
      throw new Error("Could not find a writable app data directory")
    }

    return `${root}\\${APP_NAME}`
  }

  if (!home) {
    throw new Error("Could not find a writable app data directory")
  }

  if (Deno.build.os === "darwin") {
    return `${home}/Library/Application Support/${APP_NAME}`
  }

  return `${Deno.env.get("XDG_CONFIG_HOME") ?? `${home}/.config`}/jira-tracking`
}

const settingsDir = appDataDir()
const settingsPath = `${settingsDir}${Deno.build.os === "windows" ? "\\" : "/"}${SETTINGS_FILE}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStoredJiraSettings(value: unknown): value is StoredJiraSettings {
  return (
    isRecord(value) &&
    typeof value.host === "string" &&
    typeof value.email === "string" &&
    typeof value.token === "string" &&
    typeof value.updatedAt === "string" &&
    (value.accountId === undefined || typeof value.accountId === "string") &&
    (value.avatarUrl === undefined || typeof value.avatarUrl === "string") &&
    (value.displayName === undefined || typeof value.displayName === "string")
  )
}

function publicJiraSettings(settings: StoredJiraSettings): PublicJiraSettings {
  const result: PublicJiraSettings = {
    host: settings.host,
    email: settings.email,
    updatedAt: settings.updatedAt,
  }

  if (settings.accountId) {
    result.accountId = settings.accountId
  }

  if (settings.avatarUrl) {
    result.avatarUrl = settings.avatarUrl
  }

  if (settings.displayName) {
    result.displayName = settings.displayName
  }

  return result
}

function normalizeHost(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Enter a Jira site.")
  }

  const raw = value.trim().replace(/\/+$/, "")
  const href = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL

  try {
    url = new URL(href)
  } catch {
    throw new TypeError("Enter a valid Jira site.")
  }

  if (url.protocol !== "https:" || !url.hostname) {
    throw new TypeError("Use an HTTPS Jira site.")
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("Enter only the Jira site host.")
  }

  const host = url.host.toLowerCase()

  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) {
    throw new TypeError("Enter a valid Jira site.")
  }

  return host
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Enter a Jira account email.")
  }

  const email = value.trim()

  if (!email.includes("@") || /\s/.test(email)) {
    throw new TypeError("Enter a valid Jira account email.")
  }

  return email
}

function normalizeToken(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Enter a Jira API token.")
  }

  const token = value.trim()

  if (token.length < 8) {
    throw new TypeError("Enter a valid Jira API token.")
  }

  return token
}

function normalizeJiraSettings(value: unknown): JiraSettingsInput {
  if (!isRecord(value)) {
    throw new TypeError("Enter Jira settings.")
  }

  return {
    host: normalizeHost(value.host),
    email: normalizeEmail(value.email),
    token: normalizeToken(value.token),
  }
}

function basicAuthValue(email: string, token: string) {
  const bytes = new TextEncoder().encode(`${email}:${token}`)
  let value = ""

  for (const byte of bytes) {
    value += String.fromCharCode(byte)
  }

  return `Basic ${btoa(value)}`
}

function jiraHeaders(settings: JiraSettingsInput) {
  return {
    accept: "application/json",
    authorization: basicAuthValue(settings.email, settings.token),
  }
}

function bestAvatarUrl(profile: JiraProfile) {
  const urls = profile.avatarUrls

  return (
    urls?.["48x48"] ?? urls?.["32x32"] ?? urls?.["24x24"] ?? urls?.["16x16"]
  )
}

function applyProfile(
  settings: StoredJiraSettings,
  profile: unknown
): StoredJiraSettings {
  if (!isRecord(profile)) {
    return settings
  }

  const jiraProfile: JiraProfile = profile
  const next = { ...settings }

  if (typeof jiraProfile.accountId === "string") {
    next.accountId = jiraProfile.accountId
  }

  if (typeof jiraProfile.displayName === "string") {
    next.displayName = jiraProfile.displayName
  }

  const avatarUrl = bestAvatarUrl(jiraProfile)

  if (avatarUrl) {
    next.avatarUrl = avatarUrl
  }

  return next
}

async function verifyJiraSettings(value: unknown): Promise<StoredJiraSettings> {
  const settings = normalizeJiraSettings(value)
  let response: Response

  try {
    response = await fetch(`https://${settings.host}/rest/api/3/myself`, {
      headers: jiraHeaders(settings),
    })
  } catch {
    throw new Error(
      "Could not reach Jira. Check the site URL and your network."
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Jira rejected those credentials.")
  }

  if (!response.ok) {
    throw new Error(
      `Jira returned ${response.status}. Check the Jira site and try again.`
    )
  }

  const profile = await response.json().catch(() => null)
  const verified = applyProfile(
    {
      ...settings,
      updatedAt: new Date().toISOString(),
    },
    profile
  )

  return verified
}

async function loadStoredJiraSettings(): Promise<StoredJiraSettings | null> {
  try {
    const settings = JSON.parse(await Deno.readTextFile(settingsPath))

    return isStoredJiraSettings(settings) ? settings : null
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

async function loadJiraSettings(): Promise<PublicJiraSettings | null> {
  const settings = await loadStoredJiraSettings()

  return settings ? publicJiraSettings(settings) : null
}

async function saveJiraSettings(settings: StoredJiraSettings) {
  await Deno.mkdir(settingsDir, { recursive: true })
  await Deno.writeTextFile(settingsPath, JSON.stringify(settings, null, 2))

  if (Deno.build.os !== "windows") {
    try {
      await Deno.chmod(settingsPath, 0o600)
    } catch {
      // Best effort: keep the app usable on filesystems without chmod support.
    }
  }
}

async function getRequiredStoredJiraSettings() {
  const settings = await loadStoredJiraSettings()

  if (!settings) {
    throw new Error("Connect Jira before loading Jira data.")
  }

  return settings
}

async function fetchJiraProfile(settings: StoredJiraSettings) {
  const response = await fetch(`https://${settings.host}/rest/api/3/myself`, {
    headers: jiraHeaders(settings),
  })

  if (response.status === 401 || response.status === 403) {
    throw new Error("Jira rejected the saved credentials.")
  }

  if (!response.ok) {
    throw new Error(`Jira returned ${response.status} while loading profile.`)
  }

  const profile = await response.json().catch(() => null)
  const refreshed = applyProfile(
    {
      ...settings,
      updatedAt: new Date().toISOString(),
    },
    profile
  )

  await saveJiraSettings(refreshed)

  return publicJiraSettings(refreshed)
}

function jqlString(value: string) {
  return `"${value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`
}

function issueFromJira(issue: JiraIssue): PublicJiraTicket {
  const project = issue.key.split("-")[0] || "JIRA"

  return {
    key: issue.key,
    title: issue.fields?.summary || issue.key,
    project,
    todayMinutes: 0,
    lastWorked: issue.fields?.updated || new Date().toISOString(),
  }
}

async function jiraSearch(
  settings: StoredJiraSettings,
  jql: string,
  limit = 25
) {
  const url = new URL(`https://${settings.host}/rest/api/3/search/jql`)
  url.searchParams.set("jql", jql)
  url.searchParams.set("maxResults", String(limit))
  url.searchParams.set("fields", "summary,updated")

  const response = await fetch(url, { headers: jiraHeaders(settings) })

  if (!response.ok) {
    throw new Error(`Jira returned ${response.status} while loading issues.`)
  }

  const data = (await response.json()) as JiraSearchResponse

  return (data.issues ?? []).map(issueFromJira)
}

async function jiraSearchIssues(
  settings: StoredJiraSettings,
  jql: string,
  limit = 25,
  fields = "summary,updated"
) {
  const url = new URL(`https://${settings.host}/rest/api/3/search/jql`)
  url.searchParams.set("jql", jql)
  url.searchParams.set("maxResults", String(limit))
  url.searchParams.set("fields", fields)

  const response = await fetch(url, { headers: jiraHeaders(settings) })

  if (!response.ok) {
    throw new Error(`Jira returned ${response.status} while loading issues.`)
  }

  const data = (await response.json()) as JiraSearchResponse

  return data.issues ?? []
}

async function jiraSearchWithFallback(
  settings: StoredJiraSettings,
  jqls: string[],
  limit = 25
) {
  let lastError: unknown

  for (const jql of jqls) {
    try {
      return await jiraSearch(settings, jql, limit)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

async function loadRecentJiraTickets(settings: StoredJiraSettings) {
  const recentTracked = await recentTrackedTickets(settings).catch(() => [])
  const boardChanged = await jiraSearchWithFallback(settings, [
    "status changed by currentUser() OR reporter was in (currentUser()) ORDER BY updatedDate DESC",
    "status changed by currentUser() OR reporter = currentUser() ORDER BY updated DESC",
  ]).catch(() => [])

  return dedupeTickets([...recentTracked, ...boardChanged]).slice(0, 25)
}

async function recentTrackedTickets(settings: StoredJiraSettings) {
  const issues = await jiraSearchIssues(
    settings,
    "worklogAuthor = currentUser() ORDER BY updated DESC",
    25,
    "summary,updated"
  )
  const accountId = await accountIdFor(settings)
  const withLastWorked: PublicJiraTicket[] = []
  const today = new Date()
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )

  for (const issue of issues) {
    const worklogs = await fetchIssueWorklogs(settings, issue.key)
    const myWorklogs = worklogs
      .filter(
        (worklog) => worklog.author?.accountId === accountId && worklog.started
      )
      .sort((a, b) => Date.parse(b.started ?? "") - Date.parse(a.started ?? ""))
    const lastWorklog = myWorklogs[0]

    if (!lastWorklog?.started) {
      continue
    }

    withLastWorked.push({
      ...issueFromJira(issue),
      todayMinutes: myWorklogs.reduce((total, worklog) => {
        const started = new Date(worklog.started ?? "")

        return started >= todayStart
          ? total + Math.round((worklog.timeSpentSeconds ?? 0) / 60)
          : total
      }, 0),
      lastWorked: lastWorklog.started,
    })
  }

  return withLastWorked
    .sort((a, b) => Date.parse(b.lastWorked) - Date.parse(a.lastWorked))
    .slice(0, 3)
}

function dedupeTickets(tickets: PublicJiraTicket[]) {
  const seen = new Set<string>()
  const result: PublicJiraTicket[] = []

  for (const ticket of tickets) {
    if (seen.has(ticket.key)) {
      continue
    }

    seen.add(ticket.key)
    result.push(ticket)
  }

  return result
}

async function accountIdFor(settings: StoredJiraSettings) {
  if (settings.accountId) {
    return settings.accountId
  }

  const refreshed = await fetchJiraProfile(settings)

  if (typeof refreshed.accountId !== "string") {
    throw new Error("Could not resolve your Jira accountId.")
  }

  return refreshed.accountId
}

async function fetchIssueWorklogs(
  settings: StoredJiraSettings,
  issueKey: string
) {
  const worklogs: JiraWorklog[] = []
  let startAt = 0
  let total = 1

  while (startAt < total) {
    const url = new URL(
      `https://${settings.host}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`
    )
    url.searchParams.set("startAt", String(startAt))
    url.searchParams.set("maxResults", "100")

    const response = await fetch(url, { headers: jiraHeaders(settings) })

    if (!response.ok) {
      throw new Error(
        `Jira returned ${response.status} while loading worklogs.`
      )
    }

    const data = (await response.json()) as JiraWorklogResponse
    worklogs.push(...(data.worklogs ?? []))

    total = data.total ?? 0
    startAt += data.maxResults ?? 100
  }

  return worklogs
}

function monthRange(value: string | null): WorklogRange {
  const now = new Date()
  const match = value?.match(/^(\d{4})-(\d{1,2})$/)
  const year = match ? Number(match[1]) : now.getFullYear()
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth()

  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 1),
  }
}

function jiraDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function worklogCommentText(comment: unknown): string | undefined {
  if (typeof comment === "string") {
    return comment || undefined
  }

  if (!isRecord(comment)) {
    return undefined
  }

  const parts: string[] = []
  const visit = (value: unknown) => {
    if (!isRecord(value)) {
      return
    }

    if (typeof value.text === "string") {
      parts.push(value.text)
    }

    if (Array.isArray(value.content)) {
      for (const child of value.content) {
        visit(child)
      }
    }
  }

  visit(comment)

  return parts.join(" ").trim() || undefined
}

async function searchWorklogIssues(
  settings: StoredJiraSettings,
  range: WorklogRange
) {
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`https://${settings.host}/rest/api/3/search/jql`)
    url.searchParams.set(
      "jql",
      `worklogAuthor = currentUser() AND worklogDate >= "${jiraDate(range.start)}" AND worklogDate < "${jiraDate(range.end)}" ORDER BY updated DESC`
    )
    url.searchParams.set("maxResults", "100")
    url.searchParams.set("fields", "summary")

    if (nextPageToken) {
      url.searchParams.set("nextPageToken", nextPageToken)
    }

    const response = await fetch(url, { headers: jiraHeaders(settings) })

    if (!response.ok) {
      throw new Error(
        `Jira returned ${response.status} while loading worklogs.`
      )
    }

    const data = (await response.json()) as JiraSearchResponse
    issues.push(...(data.issues ?? []))
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return issues
}

async function loadJiraWorklogs(
  settings: StoredJiraSettings,
  month: string | null
) {
  const accountId = await accountIdFor(settings)
  const range = monthRange(month)
  const issues = await searchWorklogIssues(settings, range)
  const logs: PublicWorklog[] = []

  for (const issue of issues) {
    const worklogs = await fetchIssueWorklogs(settings, issue.key)

    for (const worklog of worklogs) {
      if (worklog.author?.accountId !== accountId || !worklog.started) {
        continue
      }

      const started = new Date(worklog.started)

      if (started < range.start || started >= range.end) {
        continue
      }

      logs.push({
        id: `${issue.key}-${worklog.id}`,
        ticketKey: issue.key,
        ticketTitle: issue.fields?.summary || issue.key,
        minutes: Math.round((worklog.timeSpentSeconds ?? 0) / 60),
        startedAt: worklog.started,
        description: worklogCommentText(worklog.comment),
      })
    }
  }

  logs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  return {
    month: `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`,
    totalMinutes: logs.reduce((total, log) => total + log.minutes, 0),
    logs,
  }
}

function searchJiraTickets(settings: StoredJiraSettings, query: string) {
  const normalized = query.trim()

  if (!normalized) {
    return loadRecentJiraTickets(settings)
  }

  const maybeKey = normalized.toUpperCase()
  const jql = /^[A-Z][A-Z0-9]+-\d+$/.test(maybeKey)
    ? `key = ${maybeKey}`
    : `text ~ ${jqlString(normalized)} ORDER BY updated DESC`

  return jiraSearch(settings, jql)
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("cache-control", "no-store")

  return new Response(JSON.stringify(value), { ...init, headers })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not connect to Jira."
}

async function handleJiraSettingsApi(request: Request) {
  if (request.method === "GET") {
    return jsonResponse(await loadJiraSettings())
  }

  if (request.method !== "PUT") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET, PUT" } }
    )
  }

  let input: unknown

  try {
    input = await request.json()
  } catch {
    return jsonResponse({ message: "Enter Jira settings." }, { status: 400 })
  }

  try {
    const verified = await verifyJiraSettings(input)

    await saveJiraSettings(verified)

    return jsonResponse(publicJiraSettings(verified))
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleJiraProfileApi(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET" } }
    )
  }

  try {
    return jsonResponse(
      await fetchJiraProfile(await getRequiredStoredJiraSettings())
    )
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleJiraIssuesApi(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET" } }
    )
  }

  try {
    const url = new URL(request.url)
    const query = url.searchParams.get("q") ?? ""

    return jsonResponse(
      await searchJiraTickets(await getRequiredStoredJiraSettings(), query)
    )
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleJiraWorklogsApi(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET" } }
    )
  }

  try {
    const url = new URL(request.url)

    return jsonResponse(
      await loadJiraWorklogs(
        await getRequiredStoredJiraSettings(),
        url.searchParams.get("month")
      )
    )
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

function localUrl(path = "/") {
  const address = Deno.env.get("DENO_SERVE_ADDRESS")
  const port = address?.split(":").pop()

  if (!port) {
    throw new Error("DENO_SERVE_ADDRESS is not set")
  }

  return `http://127.0.0.1:${port}${path}`
}

function contentType(pathname: string) {
  const extension = pathname.match(/\.[^.]+$/)?.[0]

  return extension ? mimeTypes[extension] : undefined
}

async function readDistFile(pathname: string) {
  const safePath = pathname.replace(/^\/+/, "")
  const fileUrl = new URL(safePath || "index.html", distRoot)

  if (!fileUrl.href.startsWith(distRoot.href)) {
    return null
  }

  try {
    return await Deno.readFile(fileUrl)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null
    }

    throw error
  }
}

async function serveApp(request: Request) {
  const url = new URL(request.url)
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === JIRA_SETTINGS_API_PATH) {
    return handleJiraSettingsApi(request)
  }

  if (pathname === JIRA_PROFILE_API_PATH) {
    return handleJiraProfileApi(request)
  }

  if (pathname === JIRA_ISSUES_API_PATH) {
    return handleJiraIssuesApi(request)
  }

  if (pathname === JIRA_WORKLOGS_API_PATH) {
    return handleJiraWorklogsApi(request)
  }

  const assetPath = pathname === "/" ? "index.html" : pathname
  const asset = await readDistFile(assetPath)

  if (asset) {
    return new Response(asset, {
      headers: {
        "content-type": contentType(assetPath) ?? "application/octet-stream",
      },
    })
  }

  const index = await readDistFile("index.html")

  if (!index) {
    return new Response("Run `npm run build` before starting Deno Desktop.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }

  return new Response(index, {
    headers: { "content-type": mimeTypes[".html"] },
  })
}

const server = Deno.serve(serveApp)
const keepAlive = setInterval(() => {}, 60_000)

const keeperWindow = new Deno.BrowserWindow({
  title: "Jira-Tracking",
  width: 1,
  height: 1,
  x: -10_000,
  y: -10_000,
  frameless: true,
  resizable: false,
})

const tray = new Deno.Tray()

tray.setIcon(decodeBase64(TRAY_ICON_LIGHT))
tray.setIconDark(decodeBase64(TRAY_ICON_DARK))
tray.setTooltip("Jira-Tracking")
console.log(`[desktop] tray id: ${tray.trayId}`)

function parkStartupWindow() {
  keeperWindow.setPosition(-10_000, -10_000)
  keeperWindow.show()
}

parkStartupWindow()

let panelWindow: Deno.BrowserWindow | null = null

function createPanelWindow() {
  const window = new Deno.BrowserWindow({
    title: "Jira-Tracking",
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    resizable: false,
  })

  window.navigate(localUrl("/panel"))
  window.addEventListener("close", () => {
    panelWindow = null
  })

  return window
}

function showPanelWindow() {
  if (!panelWindow || panelWindow.isClosed()) {
    panelWindow = createPanelWindow()
    return
  }

  panelWindow.show()
  panelWindow.focus()
}

function togglePanelWindow() {
  if (panelWindow && !panelWindow.isClosed() && panelWindow.isVisible()) {
    panelWindow.close()
  } else {
    showPanelWindow()
  }
}

keeperWindow.addEventListener("close", (event) => {
  if (tray.trayId !== 0) {
    event.preventDefault()
    parkStartupWindow()
  }
})

if (tray.trayId === 0) {
  console.warn("[desktop] no tray icon available, showing fallback window")
  showPanelWindow()
} else {
  if (!SHOW_PANEL_ON_START) {
    Deno.dock.setVisible(false)
  }
}

if (tray.trayId !== 0 && (SHOW_PANEL_ON_START || !(await loadJiraSettings()))) {
  console.log("[desktop] showing panel window")
  showPanelWindow()
}

tray.setMenu([
  { item: { label: "Show / Hide", id: "toggle", enabled: true } },
  "separator",
  {
    item: {
      label: "Quit",
      id: "quit",
      accelerator: "CmdOrCtrl+Q",
      enabled: true,
    },
  },
])

tray.addEventListener("menuclick", (event) => {
  if (event.detail.id === "toggle") {
    togglePanelWindow()
  }

  if (event.detail.id === "quit") {
    Deno.exit(0)
  }
})

tray.addEventListener("click", () => {
  togglePanelWindow()
})

Deno.dock.addEventListener("reopen", (event) => {
  if (!event.detail.hasVisibleWindows) {
    showPanelWindow()
  }
})

// Keep native desktop objects strongly referenced across HMR/module cleanup.
Object.assign(globalThis, {
  __jiraTrackingDesktop: { keepAlive, keeperWindow, server, tray },
})
