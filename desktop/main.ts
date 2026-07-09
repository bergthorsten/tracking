import {
  desktopApiPaths,
  type FeatureStatus,
  type JiraSettingsInput,
  type PublicAppSettings,
  type JiraTicket as PublicJiraTicket,
  type JiraWorklog as PublicWorklog,
  type SavedJiraSettings as PublicJiraSettings,
} from "../src/contracts/desktop-api.ts"
import {
  defaultAppSettings,
  isRecord,
  normalizeAppSettingsUpdate,
  normalizeGlobalShortcut,
  parseStoredAppSettings,
  type AppReminder,
  type StoredAppSettings,
} from "../src/domain/app-settings.ts"
import { normalizeJiraHost } from "../src/domain/jira.ts"
import { nextReminderDate, weekdayForDate } from "../src/domain/reminders.ts"
import {
  jiraWorklogPayload,
  normalizeCreateWorklogInput,
  worklogCommentText,
} from "../src/domain/time-tracking.ts"
import {
  createJiraClient,
  isTerminalJiraError,
} from "./jira/client.ts"
import { JiraDataCache } from "./jira/data-cache.ts"
import { errorMessage, jsonResponse } from "./server/responses.ts"
import { createRouteHandler } from "./server/routes.ts"
import { serveStaticApp } from "./server/serve-app.ts"

const PANEL_WIDTH = 400
const PANEL_HEIGHT = 600
const APP_NAME = "Jira-Tracking"
const SETTINGS_FILE = "jira-settings.json"
const APP_SETTINGS_FILE = "app-settings.json"
const WORKLOG_FETCH_CONCURRENCY = 4
const DEFAULT_GLOBAL_SHORTCUT = "CmdOrCtrl+Shift+J"
const APP_IDENTIFIER = "de.bergfreunde.jira-tracking"
const SHOW_PANEL_ON_START = Deno.args.includes("--show-panel")
const DISABLE_AUTO_UPDATE = Deno.args.includes("--disable-auto-update")

const distRoot = new URL("../dist/", import.meta.url)
const appIcon = await Deno.readFile(new URL("logo.png", distRoot))
const trayIcon = await Deno.readFile(new URL("icon.svg", distRoot))
const appIconDataUrl = pngDataUrl(appIcon)
const jiraClient = createJiraClient({ fetch })

interface StoredJiraSettings extends JiraSettingsInput {
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
const appSettingsPath = `${settingsDir}${Deno.build.os === "windows" ? "\\" : "/"}${APP_SETTINGS_FILE}`
const jiraDataCache = new JiraDataCache({
  loadTtlMs: async () =>
    (await readStoredAppSettings()).cacheTtlMinutes * 60 * 1000,
})
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>()

if (defaultAppSettings.globalShortcut !== DEFAULT_GLOBAL_SHORTCUT) {
  throw new Error("Default shortcut constants are out of sync.")
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

function clearJiraCache() {
  jiraDataCache.clear()
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
    host: normalizeJiraHost(value.host),
    email: normalizeEmail(value.email),
    token: normalizeToken(value.token),
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
  const response = await jiraClient.request(settings, "/rest/api/3/myself", {
    action: "verifying credentials",
    networkErrorMessage:
      "Could not reach Jira. Check the site URL and your network.",
  })

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

async function disconnectJira() {
  try {
    await Deno.remove(settingsPath)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error
    }
  }

  clearJiraCache()
}

async function readStoredAppSettings(): Promise<StoredAppSettings> {
  try {
    const settings = JSON.parse(await Deno.readTextFile(appSettingsPath))

    return parseStoredAppSettings(settings) ?? defaultAppSettings
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof SyntaxError) {
      return defaultAppSettings
    }

    throw error
  }
}

async function saveStoredAppSettings(settings: StoredAppSettings) {
  await Deno.mkdir(settingsDir, { recursive: true })
  await Deno.writeTextFile(appSettingsPath, JSON.stringify(settings, null, 2))

  if (Deno.build.os !== "windows") {
    try {
      await Deno.chmod(appSettingsPath, 0o600)
    } catch {
      // Best effort: keep the app usable on filesystems without chmod support.
    }
  }

  scheduleReminders(settings)
}

async function loadAppSettings(): Promise<PublicAppSettings> {
  const settings = await readStoredAppSettings()

  return {
    ...settings,
    native: {
      launchAtLogin: await getLaunchAtLoginStatus(),
      notifications: await getNotificationStatus(),
      globalShortcut: getGlobalShortcutStatus(settings.globalShortcut),
    },
  }
}

async function saveAppSettings(value: unknown) {
  const settings = normalizeAppSettingsUpdate(await readStoredAppSettings(), value)

  await saveStoredAppSettings(settings)

  return loadAppSettings()
}

function startupFilePath() {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE")

  if (Deno.build.os === "darwin") {
    if (!home) {
      throw new Error("Could not find your home directory.")
    }

    return `${home}/Library/LaunchAgents/${APP_IDENTIFIER}.plist`
  }

  if (Deno.build.os === "windows") {
    const appData = Deno.env.get("APPDATA")

    if (!appData) {
      throw new Error("Could not find the Windows Startup folder.")
    }

    return `${appData}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\${APP_NAME}.cmd`
  }

  if (Deno.build.os === "linux") {
    if (!home) {
      throw new Error("Could not find your home directory.")
    }

    const configHome = Deno.env.get("XDG_CONFIG_HOME") ?? `${home}/.config`

    return `${configHome}/autostart/${APP_IDENTIFIER}.desktop`
  }

  return null
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function quoteLinuxExec(value: string) {
  return '"' + value.replace(/(["\\$`])/g, "\\$1") + '"'
}

async function getLaunchAtLoginStatus(): Promise<FeatureStatus> {
  const path = startupFilePath()

  if (!path) {
    return {
      supported: false,
      enabled: false,
      message: "Launch at login is not supported on this platform.",
    }
  }

  try {
    await Deno.stat(path)

    return { supported: true, enabled: true }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { supported: true, enabled: false }
    }

    throw error
  }
}

async function setLaunchAtLogin(enabled: unknown): Promise<FeatureStatus> {
  if (typeof enabled !== "boolean") {
    throw new TypeError("Choose whether to launch at login.")
  }

  const path = startupFilePath()

  if (!path) {
    throw new Error("Launch at login is not supported on this platform.")
  }

  if (!enabled) {
    try {
      await Deno.remove(path)
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error
      }
    }
  } else if (Deno.build.os === "darwin") {
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true })
    await Deno.writeTextFile(
      path,
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>${APP_IDENTIFIER}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>${escapeXml(Deno.execPath())}</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>\n`
    )
  } else if (Deno.build.os === "windows") {
    await Deno.mkdir(path.slice(0, path.lastIndexOf("\\")), { recursive: true })
    await Deno.writeTextFile(
      path,
      `@echo off\r\nstart "" "${Deno.execPath().replace(/"/g, '""')}"\r\n`
    )
  } else {
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true })
    await Deno.writeTextFile(
      path,
      `[Desktop Entry]\nType=Application\nName=${APP_NAME}\nExec=${quoteLinuxExec(Deno.execPath())}\nX-GNOME-Autostart-enabled=true\nNoDisplay=false\nTerminal=false\n`
    )
  }

  const settings = await readStoredAppSettings()
  await saveStoredAppSettings({
    ...settings,
    launchAtLogin: enabled,
    updatedAt: new Date().toISOString(),
  })

  return getLaunchAtLoginStatus()
}

async function getNotificationStatus(): Promise<FeatureStatus> {
  if (typeof Notification === "undefined") {
    return {
      supported: false,
      enabled: false,
      permission: "unsupported",
      message: "Native notifications are only available in Deno Desktop.",
    }
  }

  let permission = Notification.permission

  try {
    const permissions = navigator.permissions as {
      query(descriptor: { name: "notifications" }): Promise<{
        state: PermissionState
      }>
    }
    const status = await permissions.query({ name: "notifications" })
    permission = status.state === "prompt" ? "default" : status.state
  } catch {
    // Some backends report permission only through Notification.permission.
  }

  return {
    supported: true,
    enabled: permission === "granted",
    permission,
  }
}

async function requestNotificationPermission(): Promise<FeatureStatus> {
  if (typeof Notification === "undefined") {
    throw new Error("Native notifications are only available in Deno Desktop.")
  }

  if (Notification.permission !== "granted") {
    await Notification.requestPermission()
  }

  const status = await getNotificationStatus()
  const settings = await readStoredAppSettings()

  await saveStoredAppSettings({
    ...settings,
    notificationsEnabled: status.permission === "granted",
    updatedAt: new Date().toISOString(),
  })

  return status
}

function getGlobalShortcutStatus(shortcut: string): FeatureStatus {
  return {
    supported: false,
    enabled: false,
    registered: false,
    message: `Deno Desktop does not currently expose process-global shortcuts. ${shortcut} is saved for future support.`,
  }
}

async function saveGlobalShortcut(value: unknown): Promise<FeatureStatus> {
  const shortcut = normalizeGlobalShortcut(value)
  const settings = await readStoredAppSettings()

  await saveStoredAppSettings({
    ...settings,
    globalShortcut: shortcut,
    updatedAt: new Date().toISOString(),
  })

  return getGlobalShortcutStatus(shortcut)
}

function clearReminderTimers() {
  for (const timer of reminderTimers.values()) {
    clearTimeout(timer)
  }

  reminderTimers.clear()
}

function showReminderNotification(reminder: AppReminder) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return
  }

  const notification = new Notification("Log your Jira time", {
    body: `Reminder scheduled for ${reminder.time}.`,
    icon: appIconDataUrl,
    tag: `jira-tracking-reminder-${reminder.id}`,
  })

  notification.addEventListener("click", () => showPanelWindow())
}

function scheduleReminders(settings: StoredAppSettings) {
  clearReminderTimers()

  if (!settings.notificationsEnabled || !settings.remindersEnabled) {
    return
  }

  for (const reminder of settings.reminders) {
    if (!reminder.enabled) {
      continue
    }

    const nextDate = nextReminderDate(reminder)

    if (!nextDate) {
      continue
    }

    const delay = Math.min(nextDate.getTime() - Date.now(), 2_147_483_647)
    const timer = setTimeout(async () => {
      const latest = await readStoredAppSettings()
      const latestReminder = latest.reminders.find(
        (item) => item.id === reminder.id
      )

      if (
        latest.notificationsEnabled &&
        latest.remindersEnabled &&
        latestReminder?.enabled &&
        latestReminder.days.includes(weekdayForDate(new Date()))
      ) {
        showReminderNotification(latestReminder)
      }

      scheduleReminders(latest)
    }, delay)

    reminderTimers.set(reminder.id, timer)
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
  const response = await jiraClient.request(settings, "/rest/api/3/myself", {
    action: "loading your profile",
  })

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

  const response = await jiraClient.request(settings, url, {
    action: "loading issues",
  })

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

  const response = await jiraClient.request(settings, url, {
    action: "loading issues",
  })

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
      if (isTerminalJiraError(error)) {
        throw error
      }

      lastError = error
    }
  }

  throw lastError
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  )

  return results
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

  const issueWorklogs = await mapWithConcurrency(
    issues,
    WORKLOG_FETCH_CONCURRENCY,
    async (issue) => ({
      issue,
      worklogs: await fetchIssueWorklogs(settings, issue.key),
    })
  )

  for (const { issue, worklogs } of issueWorklogs) {
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

    const response = await jiraClient.request(settings, url, {
      action: `loading worklogs for ${issueKey}`,
    })

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

    const response = await jiraClient.request(settings, url, {
      action: "searching monthly worklogs",
    })

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

  const issueWorklogs = await mapWithConcurrency(
    issues,
    WORKLOG_FETCH_CONCURRENCY,
    async (issue) => ({
      issue,
      worklogs: await fetchIssueWorklogs(settings, issue.key),
    })
  )

  for (const { issue, worklogs } of issueWorklogs) {
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

async function createJiraWorklog(
  settings: StoredJiraSettings,
  value: unknown
): Promise<PublicWorklog> {
  const input = normalizeCreateWorklogInput(value)
  const url = `https://${settings.host}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog`
  const body = jiraWorklogPayload(input)

  const response = await jiraClient.request(settings, url, {
    action: "creating the worklog",
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const created = (await response.json().catch(() => null)) as unknown

  if (!isRecord(created) || typeof created.id !== "string") {
    throw new Error("Jira did not return the created worklog.")
  }

  const startedAt =
    typeof created.started === "string" ? created.started : body.started
  const seconds =
    typeof created.timeSpentSeconds === "number"
      ? created.timeSpentSeconds
      : input.minutes * 60

  jiraDataCache.invalidateAfterWorklogCreate(input.date.slice(0, 7))

  return {
    id: `${input.issueKey}-${created.id}`,
    ticketKey: input.issueKey,
    ticketTitle: input.ticketTitle ?? input.issueKey,
    minutes: Math.round(seconds / 60),
    startedAt: String(startedAt),
    description: worklogCommentText(created.comment) ?? input.note,
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

function pngDataUrl(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return `data:image/png;base64,${btoa(binary)}`
}

async function handleJiraSettingsApi(request: Request) {
  if (request.method === "GET") {
    return jsonResponse(await loadJiraSettings())
  }

  if (request.method === "DELETE") {
    try {
      await disconnectJira()

      return jsonResponse({ ok: true })
    } catch (error) {
      return jsonResponse({ message: errorMessage(error) }, { status: 400 })
    }
  }

  if (request.method !== "PUT") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET, PUT, DELETE" } }
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
    clearJiraCache()

    return jsonResponse(publicJiraSettings(verified))
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleAppSettingsApi(request: Request) {
  if (request.method === "GET") {
    return jsonResponse(await loadAppSettings())
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
    return jsonResponse({ message: "Enter app settings." }, { status: 400 })
  }

  try {
    return jsonResponse(await saveAppSettings(input))
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleLaunchAtLoginApi(request: Request) {
  if (request.method === "GET") {
    return jsonResponse(await getLaunchAtLoginStatus())
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
    return jsonResponse(
      { message: "Choose whether to launch at login." },
      { status: 400 }
    )
  }

  try {
    const enabled = isRecord(input) ? input.enabled : undefined

    return jsonResponse(await setLaunchAtLogin(enabled))
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleNotificationsApi(request: Request) {
  if (request.method === "GET") {
    return jsonResponse(await getNotificationStatus())
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET, POST" } }
    )
  }

  try {
    return jsonResponse(await requestNotificationPermission())
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleShortcutApi(request: Request) {
  if (request.method === "GET") {
    const settings = await readStoredAppSettings()

    return jsonResponse({
      shortcut: settings.globalShortcut,
      status: getGlobalShortcutStatus(settings.globalShortcut),
    })
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
    return jsonResponse({ message: "Enter a shortcut." }, { status: 400 })
  }

  try {
    const shortcut = isRecord(input) ? input.shortcut : undefined
    const status = await saveGlobalShortcut(shortcut)
    const settings = await readStoredAppSettings()

    return jsonResponse({ shortcut: settings.globalShortcut, status })
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
      await jiraDataCache.getProfile(async () =>
        fetchJiraProfile(await getRequiredStoredJiraSettings())
      )
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
    const normalizedQuery = query.trim()

    return jsonResponse(
      await jiraDataCache.getIssues(normalizedQuery, async () =>
        searchJiraTickets(
          await getRequiredStoredJiraSettings(),
          normalizedQuery
        )
      )
    )
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

async function handleJiraWorklogsApi(request: Request) {
  if (request.method === "POST") {
    let input: unknown

    try {
      input = await request.json()
    } catch {
      return jsonResponse(
        { message: "Enter worklog details." },
        { status: 400 }
      )
    }

    try {
      return jsonResponse(
        await createJiraWorklog(await getRequiredStoredJiraSettings(), input),
        { status: 201 }
      )
    } catch (error) {
      return jsonResponse({ message: errorMessage(error) }, { status: 400 })
    }
  }

  if (request.method !== "GET") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "GET, POST" } }
    )
  }

  try {
    const url = new URL(request.url)
    const month = url.searchParams.get("month")

    return jsonResponse(
      await jiraDataCache.getWorklogs(month, async () =>
        loadJiraWorklogs(await getRequiredStoredJiraSettings(), month)
      )
    )
  } catch (error) {
    return jsonResponse({ message: errorMessage(error) }, { status: 400 })
  }
}

function handleJiraRefreshApi(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse(
      { message: "Method not allowed." },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  clearJiraCache()

  return jsonResponse({ ok: true, refreshedAt: new Date().toISOString() })
}

function localUrl(path = "/") {
  const address = Deno.env.get("DENO_SERVE_ADDRESS")
  const port = address?.split(":").pop()

  if (!port) {
    throw new Error("DENO_SERVE_ADDRESS is not set")
  }

  return `http://127.0.0.1:${port}${path}`
}

const serveApp = createRouteHandler({
  routes: [
    { path: desktopApiPaths.jiraSettings, handler: handleJiraSettingsApi },
    { path: desktopApiPaths.appSettings, handler: handleAppSettingsApi },
    { path: desktopApiPaths.launchAtLogin, handler: handleLaunchAtLoginApi },
    { path: desktopApiPaths.notifications, handler: handleNotificationsApi },
    { path: desktopApiPaths.shortcut, handler: handleShortcutApi },
    { path: desktopApiPaths.jiraProfile, handler: handleJiraProfileApi },
    { path: desktopApiPaths.jiraIssues, handler: handleJiraIssuesApi },
    { path: desktopApiPaths.jiraWorklogs, handler: handleJiraWorklogsApi },
    { path: desktopApiPaths.jiraRefresh, handler: handleJiraRefreshApi },
  ],
  staticHandler: (pathname) => serveStaticApp(pathname, distRoot),
})

const server = Deno.serve(serveApp)
const keepAlive = setInterval(() => {}, 60_000)

const keeperWindow = new Deno.BrowserWindow({
  title: "Jira-Tracking",
  width: 1,
  height: 1,
  x: -10_000,
  y: -10_000,
  frameless: true,
  noActivate: true,
  resizable: false,
})

function parkKeeperWindow() {
  keeperWindow.setPosition(-10_000, -10_000)
  keeperWindow.show()
}

parkKeeperWindow()

const tray = new Deno.Tray()

tray.setIcon(trayIcon)
tray.setIconDark(trayIcon)
tray.setTooltip("Jira-Tracking")
console.log(`[desktop] tray id: ${tray.trayId}`)

function notifyUpdateReady(version: string) {
  console.log(`[desktop] update ready: ${version}; it will apply after restart`)

  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return
  }

  const notification = new Notification("Jira-Tracking update ready", {
    body: `Version ${version} will install after restarting the app.`,
    icon: appIconDataUrl,
    tag: "jira-tracking-update-ready",
  })

  notification.addEventListener("click", () => showPanelWindow())
}

function startAutoUpdate() {
  if (DISABLE_AUTO_UPDATE) {
    console.log("[desktop] auto-update disabled by startup flag")
    return
  }

  if (Deno.desktopVersion === null) {
    console.log(
      "[desktop] auto-update disabled outside packaged desktop builds"
    )
    return
  }

  Deno.autoUpdate({
    interval: 60 * 60 * 1000,
    onUpdateReady(version) {
      notifyUpdateReady(version)
    },
    onRollback(reason) {
      console.warn("[desktop] update rolled back", reason)
    },
  })
}

let isQuitting = false

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
    isQuitting = true
    Deno.exit(0)
  }
})

let panelWindow: Deno.BrowserWindow | null = null
let panelWindowVisible = false

keeperWindow.addEventListener("close", (event) => {
  if (isQuitting) {
    return
  }

  event.preventDefault()
  parkKeeperWindow()
})

function hidePanelWindow() {
  if (!panelWindow || !panelWindowVisible) {
    return
  }

  panelWindow.hide()
  panelWindowVisible = false
  console.log("[desktop] panel hidden")
}

function createPanelWindow() {
  const window = new Deno.BrowserWindow({
    title: "Jira-Tracking",
    x: 80,
    y: 80,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    resizable: true,
  })

  window.navigate(localUrl("/panel"))
  window.addEventListener("close", () => {
    if (panelWindow === window) {
      window.hide()
      panelWindowVisible = false
      console.log("[desktop] panel soft-closed")
    }
  })

  return window
}

function showPanelWindow() {
  if (!panelWindow) {
    panelWindow = createPanelWindow()
  }

  panelWindow.show()
  panelWindow.focus()
  panelWindowVisible = true

  const [x, y] = panelWindow.getPosition()
  const [width, height] = panelWindow.getSize()
  console.log(
    `[desktop] panel visible=${panelWindow.isVisible()} position=${x},${y} size=${width}x${height}`
  )
}

function togglePanelWindow() {
  if (panelWindowVisible) {
    hidePanelWindow()
  } else {
    showPanelWindow()
  }
}

tray.addEventListener("click", () => {
  togglePanelWindow()
})

if (tray.trayId === 0) {
  console.warn("[desktop] no tray icon available, showing fallback window")
  showPanelWindow()
} else {
  if (!SHOW_PANEL_ON_START) {
    Deno.dock.setVisible(false)
  }
}

if (tray.trayId !== 0 && SHOW_PANEL_ON_START) {
  console.log("[desktop] showing panel window")
  showPanelWindow()
}

Deno.dock.addEventListener("reopen", (event) => {
  if (!event.detail.hasVisibleWindows) {
    showPanelWindow()
  }
})

scheduleReminders(await readStoredAppSettings())
startAutoUpdate()

// Keep native desktop objects strongly referenced across HMR/module cleanup.
Object.assign(globalThis, {
  __jiraTrackingDesktop: {
    keepAlive,
    keeperWindow,
    panelWindow,
    reminderTimers,
    server,
    tray,
  },
})
