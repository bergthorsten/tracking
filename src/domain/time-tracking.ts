import { normalizeJiraIssueKey } from "./jira.ts"

export interface NormalizedWorklogPayloadInput {
  minutes: number
  started: Date
  note?: string
}

export interface NormalizedCreateWorklogInput
  extends NormalizedWorklogPayloadInput {
  issueKey: string
  ticketTitle?: string
  date: string
}

export interface WorklogDayEntry {
  startedAt: string
}

export function localDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function normalizeLocalDate(value: unknown) {
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

export function isValidLocalDateInput(value: string) {
  try {
    normalizeLocalDate(value)
    return true
  } catch {
    return false
  }
}

export function normalizeStartedTime(value: unknown, now = new Date()) {
  if (value === undefined || value === null || value === "") {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function normalizeCreateWorklogInput(
  value: unknown,
  now = new Date()
): NormalizedCreateWorklogInput {
  if (!isRecord(value)) {
    throw new TypeError("Enter worklog details.")
  }

  const issueKey = normalizeJiraIssueKey(value.issueKey)
  const minutes = normalizePositiveMinutes(value.minutes)
  const date = normalizeLocalDate(value.date)
  const time = normalizeStartedTime(value.startedTime, now)
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

export function jiraStarted(value: Date) {
  const offsetMinutes = -value.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absOffset = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0")
  const offsetRemainder = String(absOffset % 60).padStart(2, "0")
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hours = String(value.getHours()).padStart(2, "0")
  const minutes = String(value.getMinutes()).padStart(2, "0")
  const seconds = String(value.getSeconds()).padStart(2, "0")
  const milliseconds = String(value.getMilliseconds()).padStart(3, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}${offsetRemainder}`
}

export function jiraWorklogComment(note: string | undefined) {
  if (!note) {
    return undefined
  }

  return {
    type: "doc",
    version: 1,
    content: note.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  }
}

export function jiraWorklogPayload(input: NormalizedWorklogPayloadInput) {
  const body: Record<string, unknown> = {
    timeSpentSeconds: input.minutes * 60,
    started: jiraStarted(input.started),
  }
  const comment = jiraWorklogComment(input.note)

  if (comment) {
    body.comment = comment
  }

  return body
}

export function worklogCommentText(comment: unknown): string | undefined {
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

export function worklogDayLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000)

  if (diffDays === 0) {
    return "Today"
  }

  if (diffDays === 1) {
    return "Yesterday"
  }

  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function groupWorklogsByDay<T extends WorklogDayEntry>(
  logs: T[],
  now = new Date()
) {
  const map = new Map<string, T[]>()

  for (const log of logs) {
    const label = worklogDayLabel(log.startedAt, now)
    const entries = map.get(label) ?? []
    entries.push(log)
    map.set(label, entries)
  }

  return [...map.entries()]
}
