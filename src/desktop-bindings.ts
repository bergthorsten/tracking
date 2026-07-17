import {
  desktopApiPaths,
  type AppSettingsInput,
  type CreateJiraWorklogInput,
  type FeatureStatus,
  type JiraSettingsInput,
  type JiraTicket,
  type JiraWorklog,
  type JiraWorklogResult,
  type NotificationAction,
  type PublicAppSettings,
  type SavedJiraSettings,
} from "./contracts/desktop-api"

export type {
  AppReminder,
  AppSettingsInput,
  CreateJiraWorklogInput,
  FeatureStatus,
  JiraSettingsInput,
  JiraTicket,
  JiraWorklog,
  JiraWorklogResult,
  NotificationAction,
  PublicAppSettings,
  SavedJiraSettings,
} from "./contracts/desktop-api"

export interface DesktopBindings {
  loadJiraSettings(): Promise<SavedJiraSettings | null>
  saveJiraSettings(settings: JiraSettingsInput): Promise<SavedJiraSettings>
  disconnectJira(): Promise<void>
  loadAppSettings(): Promise<PublicAppSettings>
  saveAppSettings(settings: AppSettingsInput): Promise<PublicAppSettings>
  getLaunchAtLogin(): Promise<FeatureStatus>
  setLaunchAtLogin(enabled: boolean): Promise<FeatureStatus>
  getNotificationStatus(): Promise<FeatureStatus>
  requestNotificationPermission(): Promise<FeatureStatus>
  sendTestNotification(): Promise<FeatureStatus>
  openNotificationSettings(): Promise<FeatureStatus>
  loadJiraProfile(): Promise<SavedJiraSettings>
  loadJiraIssues(query?: string): Promise<JiraTicket[]>
  loadJiraWorklogs(month?: string): Promise<JiraWorklogResult>
  createJiraWorklog(input: CreateJiraWorklogInput): Promise<JiraWorklog>
  refreshJiraData(): Promise<void>
}

const {
  jiraSettings: jiraSettingsEndpoint,
  appSettings: appSettingsEndpoint,
  jiraProfile: jiraProfileEndpoint,
  jiraIssues: jiraIssuesEndpoint,
  jiraWorklogs: jiraWorklogsEndpoint,
  jiraRefresh: jiraRefreshEndpoint,
  launchAtLogin: launchAtLoginEndpoint,
  notifications: notificationsEndpoint,
} = desktopApiPaths

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
  loadAppSettings: () => requestDesktop<PublicAppSettings>(appSettingsEndpoint),
  saveAppSettings: (settings) =>
    requestDesktop<PublicAppSettings>(appSettingsEndpoint, {
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
    postNotificationAction("request"),
  sendTestNotification: () => postNotificationAction("test"),
  openNotificationSettings: () => postNotificationAction("open-settings"),
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

function postNotificationAction(action: NotificationAction) {
  return requestDesktop<FeatureStatus>(notificationsEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  })
}

export function getDesktopBindings() {
  const hasDesktopProxy =
    "bindings" in (globalThis as typeof globalThis & { bindings?: unknown })

  if (window.location.pathname !== "/panel" && !hasDesktopProxy) {
    return undefined
  }

  return httpDesktopBindings
}
