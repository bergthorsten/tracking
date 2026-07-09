import type {
  JiraSettingsInput,
  JiraTicket as PublicJiraTicket,
  JiraWorklog as PublicWorklog,
  JiraWorklogResult,
  SavedJiraSettings as PublicJiraSettings,
} from "../../src/contracts/desktop-api.ts"
import {
  jiraWorklogPayload,
  normalizeCreateWorklogInput,
  worklogCommentText,
} from "../../src/domain/time-tracking.ts"
import { isTerminalJiraError, type createJiraClient } from "./client.ts"
import type { JiraDataCache } from "./data-cache.ts"

const WORKLOG_FETCH_CONCURRENCY = 4

export interface StoredJiraSettings extends JiraSettingsInput {
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

type JiraClient = ReturnType<typeof createJiraClient>

export function createJiraRepository({
  client,
  cache,
  saveSettings,
}: {
  client: JiraClient
  cache: JiraDataCache
  saveSettings: (settings: StoredJiraSettings) => Promise<void>
}) {
  async function fetchProfile(settings: StoredJiraSettings) {
    return cache.getProfile(() => fetchProfileUncached(settings))
  }

  async function searchTickets(settings: StoredJiraSettings, query: string) {
    const normalized = query.trim()

    return cache.getIssues(normalized, () =>
      normalized ? searchJiraTickets(settings, normalized) : loadRecentTickets(settings)
    )
  }

  async function loadWorklogs(settings: StoredJiraSettings, month: string | null) {
    return cache.getWorklogs(month, () => loadJiraWorklogs(settings, month))
  }

  async function createWorklog(
    settings: StoredJiraSettings,
    value: unknown
  ): Promise<PublicWorklog> {
    const input = normalizeCreateWorklogInput(value)
    const url = `https://${settings.host}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog`
    const body = jiraWorklogPayload(input)

    const response = await client.request(settings, url, {
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

    cache.invalidateAfterWorklogCreate(input.date.slice(0, 7))

    return {
      id: `${input.issueKey}-${created.id}`,
      ticketKey: input.issueKey,
      ticketTitle: input.ticketTitle ?? input.issueKey,
      minutes: Math.round(seconds / 60),
      startedAt: String(startedAt),
      description: worklogCommentText(created.comment) ?? input.note,
    }
  }

  function refresh() {
    cache.clear()
  }

  async function fetchProfileUncached(settings: StoredJiraSettings) {
    const response = await client.request(settings, "/rest/api/3/myself", {
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

    await saveSettings(refreshed)

    return publicJiraSettings(refreshed)
  }

  async function accountIdFor(settings: StoredJiraSettings) {
    if (settings.accountId) {
      return settings.accountId
    }

    const refreshed = await fetchProfileUncached(settings)

    if (typeof refreshed.accountId !== "string") {
      throw new Error("Could not resolve your Jira accountId.")
    }

    return refreshed.accountId
  }

  async function loadRecentTickets(settings: StoredJiraSettings) {
    const recentTracked = await recentTrackedTickets(settings).catch(() => [])
    const boardChanged = await jiraSearchWithFallback(settings, [
      "status changed by currentUser() OR reporter was in (currentUser()) ORDER BY updatedDate DESC",
      "status changed by currentUser() OR reporter = currentUser() ORDER BY updated DESC",
    ]).catch(() => [])

    return dedupeTickets([...recentTracked, ...boardChanged]).slice(0, 25)
  }

  async function recentTrackedTickets(settings: StoredJiraSettings) {
    const issues = await searchJiraIssues({
      settings,
      jql: "worklogAuthor = currentUser() ORDER BY updated DESC",
      limit: 25,
      fields: "summary,updated",
    })
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
        ...toPublicTicket(issue),
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

  async function searchJiraTickets(settings: StoredJiraSettings, query: string) {
    const maybeKey = query.toUpperCase()
    const jql = /^[A-Z][A-Z0-9]+-\d+$/.test(maybeKey)
      ? `key = ${maybeKey}`
      : `text ~ ${jqlString(query)} ORDER BY updated DESC`

    return (await searchJiraIssues({ settings, jql })).map(toPublicTicket)
  }

  async function jiraSearchWithFallback(
    settings: StoredJiraSettings,
    jqls: string[],
    limit = 25
  ) {
    let lastError: unknown

    for (const jql of jqls) {
      try {
        return (await searchJiraIssues({ settings, jql, limit })).map(
          toPublicTicket
        )
      } catch (error) {
        if (isTerminalJiraError(error)) {
          throw error
        }

        lastError = error
      }
    }

    throw lastError
  }

  async function searchJiraIssues({
    settings,
    jql,
    limit = 25,
    fields = "summary,updated",
  }: {
    settings: StoredJiraSettings
    jql: string
    limit?: number
    fields?: string
  }) {
    const url = new URL(`https://${settings.host}/rest/api/3/search/jql`)
    url.searchParams.set("jql", jql)
    url.searchParams.set("maxResults", String(limit))
    url.searchParams.set("fields", fields)

    const response = await client.request(settings, url, {
      action: "loading issues",
    })

    const data = (await response.json()) as JiraSearchResponse

    return data.issues ?? []
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

      const response = await client.request(settings, url, {
        action: `loading worklogs for ${issueKey}`,
      })

      const data = (await response.json()) as JiraWorklogResponse
      worklogs.push(...(data.worklogs ?? []))

      total = data.total ?? 0
      startAt += data.maxResults ?? 100
    }

    return worklogs
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

      const response = await client.request(settings, url, {
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
  ): Promise<JiraWorklogResult> {
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

  return {
    createWorklog,
    fetchProfile,
    loadWorklogs,
    refresh,
    searchTickets,
  }
}

export function publicJiraSettings(
  settings: StoredJiraSettings
): PublicJiraSettings {
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

export function applyProfile(
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

function bestAvatarUrl(profile: JiraProfile) {
  const urls = profile.avatarUrls

  return (
    urls?.["48x48"] ?? urls?.["32x32"] ?? urls?.["24x24"] ?? urls?.["16x16"]
  )
}

function jqlString(value: string) {
  return `"${value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`
}

function toPublicTicket(issue: JiraIssue): PublicJiraTicket {
  const project = issue.key.split("-")[0] || "JIRA"

  return {
    key: issue.key,
    title: issue.fields?.summary || issue.key,
    project,
    todayMinutes: 0,
    lastWorked: issue.fields?.updated || new Date().toISOString(),
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
