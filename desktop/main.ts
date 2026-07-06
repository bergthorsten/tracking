import {
  defaultAppSettings,
  dayIndexFor,
  isRecord,
  isStoredAppSettings,
  jiraWorklogPayload,
  nextReminderDate,
  normalizeAppSettings,
  normalizeGlobalShortcut,
  TtlCache,
  type AppReminder,
  type StoredAppSettings,
} from "../src/features/desktop-logic.ts"

const PANEL_WIDTH = 400
const PANEL_HEIGHT = 600
const APP_NAME = "Jira-Tracking"
const SETTINGS_FILE = "jira-settings.json"
const APP_SETTINGS_FILE = "app-settings.json"
const JIRA_SETTINGS_API_PATH = "/api/jira-settings"
const APP_SETTINGS_API_PATH = "/api/app-settings"
const JIRA_PROFILE_API_PATH = "/api/jira-profile"
const JIRA_ISSUES_API_PATH = "/api/jira-issues"
const JIRA_WORKLOGS_API_PATH = "/api/jira-worklogs"
const JIRA_REFRESH_API_PATH = "/api/jira-refresh"
const LAUNCH_AT_LOGIN_API_PATH = "/api/launch-at-login"
const NOTIFICATIONS_API_PATH = "/api/notifications"
const SHORTCUT_API_PATH = "/api/shortcut"
const WORKLOG_FETCH_CONCURRENCY = 4
const DEFAULT_GLOBAL_SHORTCUT = "CmdOrCtrl+Shift+J"
const APP_IDENTIFIER = "de.bergfreunde.jira-tracking"
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

interface FeatureStatus {
  supported: boolean
  enabled?: boolean
  permission?: NotificationPermission | "unsupported"
  registered?: boolean
  message?: string
}

interface PublicAppSettings extends StoredAppSettings {
  native: {
    launchAtLogin: FeatureStatus
    notifications: FeatureStatus
    globalShortcut: FeatureStatus
  }
}

interface NormalizedCreateWorklogInput {
  issueKey: string
  ticketTitle?: string
  minutes: number
  date: string
  started: Date
  note?: string
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
const jiraCache = new TtlCache()
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

function cacheKeyForMonth(value: string | null) {
  const range = monthRange(value)

  return `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`
}

async function cachedJiraData<T>(
  key: string,
  load: () => Promise<T>,
  options: { force?: boolean } = {}
) {
  const cached = options.force ? undefined : jiraCache.get<T>(key)

  if (cached) {
    return cached.value
  }

  const value = await load()
  const settings = await readStoredAppSettings()
  jiraCache.set(key, value, settings.cacheTtlMinutes * 60 * 1000)

  return value
}

function clearJiraCache() {
  jiraCache.clear()
}

function deleteCacheKeyPrefix(prefix: string) {
  jiraCache.deletePrefix(prefix)
}

function invalidateJiraCacheAfterWorklogCreate(worklogMonth: string) {
  deleteCacheKeyPrefix("issues:")
  jiraCache.delete(`worklogs:${worklogMonth}`)
  jiraCache.delete(`worklogs:${cacheKeyForMonth(null)}`)
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

function normalizeIssueKey(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Choose a Jira ticket.")
  }

  const issueKey = value.trim().toUpperCase()

  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(issueKey)) {
    throw new TypeError("Choose a valid Jira ticket.")
  }

  return issueKey
}

function normalizePositiveMinutes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Enter time to log.")
  }

  const minutes = Math.round(value)

  if (minutes <= 0) {
    throw new TypeError("Log at least one minute.")
  }

  return minutes
}

function normalizeLocalDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("Select a valid worklog date.")
  }

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new TypeError("Select a valid worklog date.")
  }

  return { year, month, day, value }
}

function normalizeStartedTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    const now = new Date()

    return {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
      milliseconds: now.getMilliseconds(),
    }
  }

  if (typeof value !== "string") {
    throw new TypeError("Select a valid started time.")
  }

  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)

  if (!match) {
    throw new TypeError("Select a valid started time.")
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] ? Number(match[3]) : 0

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new TypeError("Select a valid started time.")
  }

  return { hours, minutes, seconds, milliseconds: 0 }
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new TypeError("Enter valid text.")
  }

  const text = value.trim()

  if (!text) {
    return undefined
  }

  return text.slice(0, maxLength)
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

function normalizeCreateWorklogInput(
  value: unknown
): NormalizedCreateWorklogInput {
  if (!isRecord(value)) {
    throw new TypeError("Enter worklog details.")
  }

  const issueKey = normalizeIssueKey(value.issueKey)
  const minutes = normalizePositiveMinutes(value.minutes)
  const date = normalizeLocalDate(value.date)
  const time = normalizeStartedTime(value.startedTime)
  const ticketTitle = normalizeOptionalText(value.ticketTitle, 500)
  const note = normalizeOptionalText(value.note, 32_767)

  return {
    issueKey,
    ticketTitle,
    minutes,
    date: date.value,
    started: new Date(
      date.year,
      date.month - 1,
      date.day,
      time.hours,
      time.minutes,
      time.seconds,
      time.milliseconds
    ),
    note,
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

class JiraHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "JiraHttpError"
  }
}

function retryAfterMessage(value: string | null) {
  if (!value) {
    return "Try again in a minute."
  }

  const seconds = Number(value)

  if (Number.isFinite(seconds) && seconds > 0) {
    return `Try again in ${Math.ceil(seconds)} seconds.`
  }

  const date = Date.parse(value)

  if (Number.isFinite(date)) {
    const secondsFromNow = Math.max(1, Math.ceil((date - Date.now()) / 1000))

    return `Try again in ${secondsFromNow} seconds.`
  }

  return "Try again in a minute."
}

function jiraError(response: Response, action: string) {
  if (response.status === 401 || response.status === 403) {
    return new JiraHttpError(
      "Jira rejected the saved credentials or you do not have permission.",
      response.status
    )
  }

  if (response.status === 429) {
    return new JiraHttpError(
      `Jira rate-limited this request while ${action}. ${retryAfterMessage(
        response.headers.get("retry-after")
      )}`,
      response.status
    )
  }

  return new JiraHttpError(
    `Jira returned ${response.status} while ${action}.`,
    response.status
  )
}

function isTerminalJiraError(error: unknown) {
  return error instanceof JiraHttpError && [401, 403, 429].includes(error.status)
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

  if (!response.ok) {
    throw jiraError(response, "verifying credentials")
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

    return isStoredAppSettings(settings)
      ? { ...defaultAppSettings, ...settings }
      : defaultAppSettings
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
  const settings = normalizeAppSettings(value)

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
        latestReminder.days[dayIndexFor(new Date())]
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
  const response = await fetch(`https://${settings.host}/rest/api/3/myself`, {
    headers: jiraHeaders(settings),
  })

  if (!response.ok) {
    throw jiraError(response, "loading your profile")
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
    throw jiraError(response, "loading issues")
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
    throw jiraError(response, "loading issues")
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
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
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

    const response = await fetch(url, { headers: jiraHeaders(settings) })

    if (!response.ok) {
      throw jiraError(response, `loading worklogs for ${issueKey}`)
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
      throw jiraError(response, "searching monthly worklogs")
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...jiraHeaders(settings),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw jiraError(response, "creating the worklog")
  }

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

  invalidateJiraCacheAfterWorklogCreate(input.date.slice(0, 7))

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
      await cachedJiraData("profile", async () =>
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
      await cachedJiraData(`issues:${normalizedQuery}`, async () =>
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
    const cacheKey = `worklogs:${cacheKeyForMonth(month)}`

    return jsonResponse(
      await cachedJiraData(cacheKey, async () =>
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

  if (pathname === APP_SETTINGS_API_PATH) {
    return handleAppSettingsApi(request)
  }

  if (pathname === LAUNCH_AT_LOGIN_API_PATH) {
    return handleLaunchAtLoginApi(request)
  }

  if (pathname === NOTIFICATIONS_API_PATH) {
    return handleNotificationsApi(request)
  }

  if (pathname === SHORTCUT_API_PATH) {
    return handleShortcutApi(request)
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

  if (pathname === JIRA_REFRESH_API_PATH) {
    return handleJiraRefreshApi(request)
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
    tag: "jira-tracking-update-ready",
  })

  notification.addEventListener("click", () => showPanelWindow())
}

function startAutoUpdate() {
  if (Deno.desktopVersion === null) {
    console.log("[desktop] auto-update disabled outside packaged desktop builds")
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

function parkStartupWindow() {
  keeperWindow.setPosition(-10_000, -10_000)
  keeperWindow.show()
}

parkStartupWindow()

let panelWindow: Deno.BrowserWindow | null = null
let isQuitting = false

interface TrayBounds {
  x: number
  y: number
  width: number
  height: number
}

function trayBounds(): TrayBounds | null {
  const candidate = tray as unknown as { getBounds?: () => TrayBounds }

  try {
    return candidate.getBounds?.() ?? null
  } catch {
    return null
  }
}

function positionPanelWindow(window: Deno.BrowserWindow) {
  const bounds = trayBounds()

  if (!bounds) {
    window.setPosition(80, 80)
    return
  }

  const x = Math.max(
    8,
    Math.round(bounds.x + bounds.width / 2 - PANEL_WIDTH / 2)
  )
  const belowY = bounds.y + bounds.height + 8
  const aboveY = bounds.y - PANEL_HEIGHT - 8
  const y = aboveY > 8 ? aboveY : belowY

  window.setPosition(x, Math.max(8, y))
}

function hidePanelWindow() {
  if (panelWindow && !panelWindow.isClosed() && panelWindow.isVisible()) {
    panelWindow.hide()
  }
}

function createPanelWindow() {
  const window = new Deno.BrowserWindow({
    title: "Jira-Tracking",
    x: -10_000,
    y: -10_000,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    alwaysOnTop: true,
    frameless: true,
    resizable: false,
  })

  window.navigate(localUrl("/panel"))
  window.addEventListener("blur", () => {
    setTimeout(() => {
      if (panelWindow === window) {
        hidePanelWindow()
      }
    }, 120)
  })
  window.addEventListener("close", (event) => {
    if (isQuitting) {
      panelWindow = null
      return
    }

    event.preventDefault()
    hidePanelWindow()
  })

  return window
}

function showPanelWindow() {
  if (!panelWindow || panelWindow.isClosed()) {
    panelWindow = createPanelWindow()
  }

  positionPanelWindow(panelWindow)
  panelWindow.show()
  panelWindow.focus()
}

function togglePanelWindow() {
  if (panelWindow && !panelWindow.isClosed() && panelWindow.isVisible()) {
    hidePanelWindow()
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
    isQuitting = true
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

scheduleReminders(await readStoredAppSettings())
startAutoUpdate()

// Keep native desktop objects strongly referenced across HMR/module cleanup.
Object.assign(globalThis, {
  __jiraTrackingDesktop: {
    keepAlive,
    keeperWindow,
    reminderTimers,
    server,
    tray,
  },
})
