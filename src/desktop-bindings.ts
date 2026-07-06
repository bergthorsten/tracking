export interface JiraSettingsInput {
  host: string
  email: string
  token: string
}

export interface SavedJiraSettings {
  host: string
  email: string
  accountId?: string
  avatarUrl?: string
  displayName?: string
  updatedAt: string
}

export interface JiraTicket {
  key: string
  title: string
  project: string
  todayMinutes: number
  lastWorked: string
}

export interface JiraWorklog {
  id: string
  ticketKey: string
  ticketTitle: string
  minutes: number
  startedAt: string
  description?: string
}

export interface JiraWorklogResult {
  month: string
  totalMinutes: number
  logs: JiraWorklog[]
}

export interface CreateJiraWorklogInput {
  issueKey: string
  ticketTitle?: string
  minutes: number
  date: string
  note?: string
}

export interface AppReminder {
  id: string
  time: string
  days: boolean[]
  enabled: boolean
}

export interface FeatureStatus {
  supported: boolean
  enabled?: boolean
  permission?: NotificationPermission | "unsupported"
  registered?: boolean
  message?: string
}

export interface AppSettings {
  remindersEnabled: boolean
  notificationsEnabled: boolean
  reminders: AppReminder[]
  launchAtLogin: boolean
  globalShortcut: string
  cacheTtlMinutes: number
  updatedAt: string
  native: {
    launchAtLogin: FeatureStatus
    notifications: FeatureStatus
    globalShortcut: FeatureStatus
  }
}

export type AppSettingsInput = Omit<AppSettings, "native">

export interface ShortcutResult {
  shortcut: string
  status: FeatureStatus
}

export interface DesktopBindings {
  loadJiraSettings(): Promise<SavedJiraSettings | null>
  saveJiraSettings(settings: JiraSettingsInput): Promise<SavedJiraSettings>
  disconnectJira(): Promise<void>
  loadAppSettings(): Promise<AppSettings>
  saveAppSettings(settings: AppSettingsInput): Promise<AppSettings>
  getLaunchAtLogin(): Promise<FeatureStatus>
  setLaunchAtLogin(enabled: boolean): Promise<FeatureStatus>
  getNotificationStatus(): Promise<FeatureStatus>
  requestNotificationPermission(): Promise<FeatureStatus>
  getShortcut(): Promise<ShortcutResult>
  setShortcut(shortcut: string): Promise<ShortcutResult>
  loadJiraProfile(): Promise<SavedJiraSettings>
  loadJiraIssues(query?: string): Promise<JiraTicket[]>
  loadJiraWorklogs(month?: string): Promise<JiraWorklogResult>
  createJiraWorklog(input: CreateJiraWorklogInput): Promise<JiraWorklog>
  refreshJiraData(): Promise<void>
}

const jiraSettingsEndpoint = "/api/jira-settings"
const appSettingsEndpoint = "/api/app-settings"
const jiraProfileEndpoint = "/api/jira-profile"
const jiraIssuesEndpoint = "/api/jira-issues"
const jiraWorklogsEndpoint = "/api/jira-worklogs"
const jiraRefreshEndpoint = "/api/jira-refresh"
const launchAtLoginEndpoint = "/api/launch-at-login"
const notificationsEndpoint = "/api/notifications"
const shortcutEndpoint = "/api/shortcut"

const httpDesktopBindings: DesktopBindings = {
  loadJiraSettings: () =>
    requestDesktop<SavedJiraSettings | null>(jiraSettingsEndpoint),
  saveJiraSettings: (settings) =>
    requestDesktop<SavedJiraSettings>(jiraSettingsEndpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
  disconnectJira: () =>
    requestDesktop<void>(jiraSettingsEndpoint, { method: "DELETE" }),
  loadAppSettings: () => requestDesktop<AppSettings>(appSettingsEndpoint),
  saveAppSettings: (settings) =>
    requestDesktop<AppSettings>(appSettingsEndpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
  getLaunchAtLogin: () => requestDesktop<FeatureStatus>(launchAtLoginEndpoint),
  setLaunchAtLogin: (enabled) =>
    requestDesktop<FeatureStatus>(launchAtLoginEndpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  getNotificationStatus: () =>
    requestDesktop<FeatureStatus>(notificationsEndpoint),
  requestNotificationPermission: () =>
    requestDesktop<FeatureStatus>(notificationsEndpoint, { method: "POST" }),
  getShortcut: () => requestDesktop<ShortcutResult>(shortcutEndpoint),
  setShortcut: (shortcut) =>
    requestDesktop<ShortcutResult>(shortcutEndpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shortcut }),
    }),
  loadJiraProfile: () => requestDesktop<SavedJiraSettings>(jiraProfileEndpoint),
  loadJiraIssues: (query) => {
    const params = new URLSearchParams()

    if (query) {
      params.set("q", query)
    }

    return requestDesktop<JiraTicket[]>(
      params.size ? `${jiraIssuesEndpoint}?${params}` : jiraIssuesEndpoint
    )
  },
  loadJiraWorklogs: (month) => {
    const params = new URLSearchParams()

    if (month) {
      params.set("month", month)
    }

    return requestDesktop<JiraWorklogResult>(
      params.size ? `${jiraWorklogsEndpoint}?${params}` : jiraWorklogsEndpoint
    )
  },
  createJiraWorklog: (input) =>
    requestDesktop<JiraWorklog>(jiraWorklogsEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  refreshJiraData: () =>
    requestDesktop<void>(jiraRefreshEndpoint, { method: "POST" }),
}

async function requestDesktop<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set("accept", "application/json")

  const response = await fetch(endpoint, {
    ...init,
    headers,
  })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : `Desktop request failed (${response.status}).`

    throw new Error(message)
  }

  return body as T
}

export function getDesktopBindings() {
  const hasDesktopProxy =
    "bindings" in (globalThis as typeof globalThis & { bindings?: unknown })

  if (window.location.pathname !== "/panel" && !hasDesktopProxy) {
    return undefined
  }

  return httpDesktopBindings
}
