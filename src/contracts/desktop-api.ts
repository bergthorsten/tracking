import type {
  AppReminder,
  StoredAppSettings,
  UpdateAppSettingsInput,
} from "../domain/app-settings.ts"

export type { AppReminder } from "../domain/app-settings.ts"

export const desktopApiPaths = {
  jiraSettings: "/api/jira-settings",
  appSettings: "/api/app-settings",
  jiraProfile: "/api/jira-profile",
  jiraIssues: "/api/jira-issues",
  jiraWorklogs: "/api/jira-worklogs",
  jiraRefresh: "/api/jira-refresh",
  launchAtLogin: "/api/launch-at-login",
  notifications: "/api/notifications",
} as const

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
  trackedMinutes?: number
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
  startedTime?: string
  note?: string
}

export type DesktopNotificationPermission = "default" | "denied" | "granted"

export interface FeatureStatus {
  supported: boolean
  enabled?: boolean
  permission?: DesktopNotificationPermission | "unsupported"
  registered?: boolean
  message?: string
}

export interface PublicAppSettings extends StoredAppSettings {
  reminders: AppReminder[]
  native: {
    launchAtLogin: FeatureStatus
    notifications: FeatureStatus
  }
}

export type AppSettingsInput = UpdateAppSettingsInput
