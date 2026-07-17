import {
  desktopApiPaths,
  type FeatureStatus,
  type JiraSettingsInput,
  type PublicAppSettings,
  type SavedJiraSettings as PublicJiraSettings,
} from "../src/contracts/desktop-api.ts"
import {
  defaultAppSettings,
  isRecord,
  normalizeAppSettingsUpdate,
  parseStoredAppSettings,
  type AppReminder,
  type StoredAppSettings,
} from "../src/domain/app-settings.ts"
import { normalizeJiraHost } from "../src/domain/jira.ts"
import { nextReminderDate, weekdayForDate } from "../src/domain/reminders.ts"
import { createAutoUpdater } from "./auto-update.ts"
import { createJiraClient } from "./jira/client.ts"
import { JiraDataCache } from "./jira/data-cache.ts"
import {
  applyProfile,
  createJiraRepository,
  publicJiraSettings,
  type StoredJiraSettings,
} from "./jira/repository.ts"
import { errorMessage, jsonResponse } from "./server/responses.ts"
import { createRouteHandler } from "./server/routes.ts"
import { serveStaticApp } from "./server/serve-app.ts"

const PANEL_WIDTH = 400
const PANEL_HEIGHT = 600
const APP_NAME = "Jira-Tracking"
const SETTINGS_FILE = "jira-settings.json"
const APP_SETTINGS_FILE = "app-settings.json"
const APP_IDENTIFIER = "de.bergfreunde.jira-tracking"
const SHOW_PANEL_ON_START =
  Deno.build.os === "windows" || Deno.args.includes("--show-panel")
const DISABLE_AUTO_UPDATE = Deno.args.includes("--disable-auto-update")

const distRoot = new URL("../dist/", import.meta.url)
const appIcon = await Deno.readFile(new URL("logo.png", distRoot))
const trayIcon = await Deno.readFile(new URL("icon.svg", distRoot))
const appIconDataUrl = pngDataUrl(appIcon)
const jiraClient = createJiraClient({ fetch })

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
const jiraRepository = createJiraRepository({
  client: jiraClient,
  cache: jiraDataCache,
  saveSettings: saveJiraSettings,
})
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

  jiraRepository.refresh()
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
  const notifications = await getNotificationStatus()
  const settings = await readStoredAppSettings()

  return {
    ...settings,
    native: {
      launchAtLogin: await getLaunchAtLoginStatus(),
      notifications,
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

type NotificationPermissionState =
  | "default"
  | "denied"
  | "granted"
  | "unsupported"

function notificationStatusMessage(
  permission: NotificationPermissionState
): string | undefined {
  switch (permission) {
    case "denied":
      return "Blocked in system settings. Allow notifications for Jira-Tracking, then check again."
    case "default":
      return "Permission not granted yet. Enable notifications to request access."
    case "granted":
      return "Reminders fire while the app is running."
    default:
      return undefined
  }
}

async function queryNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === "undefined") {
    return "unsupported"
  }

  try {
    const permissions = navigator.permissions as {
      query(descriptor: { name: "notifications" }): Promise<{
        state: PermissionState
      }>
    }
    const status = await permissions.query({ name: "notifications" })
    return status.state === "prompt" ? "default" : status.state
  } catch {
    // Some backends report permission only through Notification.permission.
    return Notification.permission
  }
}

async function syncNotificationsEnabledWithPermission(
  permission: NotificationPermissionState
) {
  if (permission !== "denied") {
    return
  }

  const settings = await readStoredAppSettings()

  if (!settings.notificationsEnabled) {
    return
  }

  await saveStoredAppSettings({
    ...settings,
    notificationsEnabled: false,
    updatedAt: new Date().toISOString(),
  })
}

async function getNotificationStatus(): Promise<FeatureStatus> {
  const permission = await queryNotificationPermission()

  if (permission === "unsupported") {
    return {
      supported: false,
      enabled: false,
      permission: "unsupported",
      message: "Native notifications are only available in Deno Desktop.",
    }
  }

  await syncNotificationsEnabledWithPermission(permission)

  return {
    supported: true,
    enabled: permission === "granted",
    permission,
    message: notificationStatusMessage(permission),
  }
}

async function showDesktopNotification(
  title: string,
  options: NotificationOptions,
  onClick?: () => void
): Promise<{ ok: boolean; error?: string }> {
  const permission = await queryNotificationPermission()

  if (permission === "unsupported") {
    return { ok: false, error: "Native notifications are unavailable." }
  }

  if (permission === "denied") {
    await syncNotificationsEnabledWithPermission(permission)
    return {
      ok: false,
      error: "Notifications are blocked in system settings.",
    }
  }

  try {
    const notification = new Notification(title, options)

    if (onClick) {
      notification.addEventListener("click", onClick)
    }

    return await new Promise((resolve) => {
      let settled = false
      const finish = (result: { ok: boolean; error?: string }) => {
        if (settled) {
          return
        }

        settled = true
        resolve(result)
      }

      notification.addEventListener("show", () => finish({ ok: true }))
      notification.addEventListener("error", () =>
        finish({
          ok: false,
          error: "The OS could not display the notification.",
        })
      )
      // Some backends never emit show; treat a quiet success as delivered.
      setTimeout(() => finish({ ok: true }), 750)
    })
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

async function requestNotificationPermission(): Promise<FeatureStatus> {
  if (typeof Notification === "undefined") {
    throw new Error("Native notifications are only available in Deno Desktop.")
  }

  if (Notification.permission !== "granted") {
    await Notification.requestPermission()
  }

  const permission = await queryNotificationPermission()

  if (permission === "denied" || permission === "unsupported") {
    await syncNotificationsEnabledWithPermission(permission)
    return getNotificationStatus()
  }

  const delivered = await showDesktopNotification(
    "Notifications enabled",
    {
      body: "You'll get reminders while Jira-Tracking is running.",
      icon: appIconDataUrl,
      tag: "jira-tracking-notifications-enabled",
    },
    () => showPanelWindow()
  )

  const settings = await readStoredAppSettings()
  await saveStoredAppSettings({
    ...settings,
    notificationsEnabled: delivered.ok,
    updatedAt: new Date().toISOString(),
  })

  if (!delivered.ok) {
    return {
      supported: true,
      enabled: false,
      permission,
      message:
        delivered.error ||
        "Could not show a notification. Check system notification settings.",
    }
  }

  return {
    supported: true,
    enabled: true,
    permission,
    message: "Notifications are enabled.",
  }
}

async function sendTestNotification(): Promise<FeatureStatus> {
  const status = await getNotificationStatus()

  if (!status.supported || status.permission === "unsupported") {
    throw new Error("Native notifications are only available in Deno Desktop.")
  }

  if (status.permission === "denied") {
    throw new Error(
      status.message || "Notifications are blocked in system settings."
    )
  }

  const delivered = await showDesktopNotification(
    "Test notification",
    {
      body: "If you can read this, reminders can reach you.",
      icon: appIconDataUrl,
      tag: "jira-tracking-notification-test",
    },
    () => showPanelWindow()
  )

  if (!delivered.ok) {
    throw new Error(
      delivered.error || "The OS could not display the notification."
    )
  }

  return {
    ...status,
    enabled: true,
    message: "Test notification sent.",
  }
}

async function openNotificationSettings(): Promise<FeatureStatus> {
  if (Deno.build.os === "darwin") {
    const targeted =
      `x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=${APP_IDENTIFIER}`
    const fallback =
      "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
    const first = await new Deno.Command("open", { args: [targeted] }).output()

    if (first.code !== 0) {
      const second = await new Deno.Command("open", {
        args: [fallback],
      }).output()

      if (second.code !== 0) {
        throw new Error("Could not open macOS notification settings.")
      }
    }
  } else if (Deno.build.os === "windows") {
    const result = await new Deno.Command("cmd", {
      args: ["/c", "start", "", "ms-settings:notifications"],
    }).output()

    if (result.code !== 0) {
      throw new Error("Could not open Windows notification settings.")
    }
  } else {
    throw new Error(
      "Open your system notification settings and allow Jira-Tracking."
    )
  }

  return {
    ...(await getNotificationStatus()),
    message: "Opened system notification settings.",
  }
}

function clearReminderTimers() {
  for (const timer of reminderTimers.values()) {
    clearTimeout(timer)
  }

  reminderTimers.clear()
}

async function showReminderNotification(reminder: AppReminder) {
  const result = await showDesktopNotification(
    "Log your Jira time",
    {
      body: `Reminder scheduled for ${reminder.time}.`,
      icon: appIconDataUrl,
      tag: `jira-tracking-reminder-${reminder.id}`,
    },
    () => showPanelWindow()
  )

  if (!result.ok) {
    console.warn(`[desktop] reminder notification skipped: ${result.error}`)
  }
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
        await showReminderNotification(latestReminder)
      }

      scheduleReminders(await readStoredAppSettings())
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
    jiraRepository.refresh()

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

  let action = "request"

  try {
    const text = await request.text()

    if (text.trim()) {
      const body = JSON.parse(text) as unknown

      if (isRecord(body) && typeof body.action === "string" && body.action) {
        action = body.action
      }
    }
  } catch {
    return jsonResponse(
      { message: "Invalid notification request." },
      { status: 400 }
    )
  }

  try {
    if (action === "request") {
      return jsonResponse(await requestNotificationPermission())
    }

    if (action === "test") {
      return jsonResponse(await sendTestNotification())
    }

    if (action === "open-settings") {
      return jsonResponse(await openNotificationSettings())
    }

    return jsonResponse(
      { message: "Unknown notification action." },
      { status: 400 }
    )
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
      await jiraRepository.fetchProfile(await getRequiredStoredJiraSettings())
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
      await jiraRepository.searchTickets(
        await getRequiredStoredJiraSettings(),
        query
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
        await jiraRepository.createWorklog(
          await getRequiredStoredJiraSettings(),
          input
        ),
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
      await jiraRepository.loadWorklogs(
        await getRequiredStoredJiraSettings(),
        month
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

  jiraRepository.refresh()

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
  console.log(
    `[desktop] update ready: ${version}; quit the app to install the notarized build`
  )

  void showDesktopNotification(
    "Jira-Tracking update ready",
    {
      body: `Version ${version} is downloaded. Quit the app to install it.`,
      icon: appIconDataUrl,
      tag: "jira-tracking-update-ready",
    },
    () => showPanelWindow()
  ).then((result) => {
    if (!result.ok) {
      console.warn(`[desktop] update notification skipped: ${result.error}`)
    }
  })
}

const autoUpdater =
  !DISABLE_AUTO_UPDATE && Deno.desktopVersion !== null
    ? createAutoUpdater({
        currentVersion: Deno.desktopVersion,
        settingsDir,
        onUpdateReady: notifyUpdateReady,
        onError(error) {
          console.warn("[desktop] auto-update check failed", error)
        },
      })
    : null

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

  if (!autoUpdater) {
    return
  }

  // Full notarized archive replacement — Deno.autoUpdate patches libruntime.dylib
  // in-place and would invalidate Developer ID / Gatekeeper seals on macOS.
  // See https://docs.deno.com/runtime/desktop/auto_update/
  console.log(
    `[desktop] auto-update enabled for ${Deno.desktopVersion} via GitHub Releases`
  )
  void autoUpdater.start()
}

let isQuitting = false

function quitApp() {
  isQuitting = true

  if (autoUpdater?.hasStagedUpdate()) {
    autoUpdater.applyStagedUpdateAndExit()
  }

  Deno.exit(0)
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
    quitApp()
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
  window.addEventListener("close", (event) => {
    event.preventDefault()
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
    autoUpdater,
    keepAlive,
    keeperWindow,
    panelWindow,
    reminderTimers,
    server,
    tray,
  },
})
