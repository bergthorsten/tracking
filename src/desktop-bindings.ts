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

export interface DesktopBindings {
  loadJiraSettings(): Promise<SavedJiraSettings | null>
  saveJiraSettings(settings: JiraSettingsInput): Promise<SavedJiraSettings>
  loadJiraProfile(): Promise<SavedJiraSettings>
  loadJiraIssues(query?: string): Promise<JiraTicket[]>
  loadJiraWorklogs(month?: string): Promise<JiraWorklogResult>
}

const jiraSettingsEndpoint = "/api/jira-settings"
const jiraProfileEndpoint = "/api/jira-profile"
const jiraIssuesEndpoint = "/api/jira-issues"
const jiraWorklogsEndpoint = "/api/jira-worklogs"

const httpDesktopBindings: DesktopBindings = {
  loadJiraSettings: () =>
    requestDesktop<SavedJiraSettings | null>(jiraSettingsEndpoint),
  saveJiraSettings: (settings) =>
    requestDesktop<SavedJiraSettings>(jiraSettingsEndpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
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
