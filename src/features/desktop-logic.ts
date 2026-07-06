export const DEFAULT_CACHE_TTL_MINUTES = 5

export interface AppReminder {
  id: string
  time: string
  days: boolean[]
  enabled: boolean
}

export interface StoredAppSettings {
  remindersEnabled: boolean
  notificationsEnabled: boolean
  reminders: AppReminder[]
  launchAtLogin: boolean
  globalShortcut: string
  cacheTtlMinutes: number
  updatedAt: string
}

export interface NormalizedWorklogPayloadInput {
  minutes: number
  started: Date
  note?: string
}

export interface TtlCacheHit<T> {
  value: T
  expiresAt: number
}

export const defaultAppSettings: StoredAppSettings = {
  remindersEnabled: true,
  notificationsEnabled: false,
  reminders: [
    {
      id: "r1",
      time: "11:30",
      days: [true, true, true, true, true, false, false],
      enabled: true,
    },
    {
      id: "r2",
      time: "16:45",
      days: [true, true, true, true, true, false, false],
      enabled: true,
    },
  ],
  launchAtLogin: false,
  globalShortcut: "CmdOrCtrl+Shift+J",
  cacheTtlMinutes: DEFAULT_CACHE_TTL_MINUTES,
  updatedAt: new Date(0).toISOString(),
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isReminder(value: unknown): value is AppReminder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.time === "string" &&
    /^\d{2}:\d{2}$/.test(value.time) &&
    Array.isArray(value.days) &&
    value.days.length === 7 &&
    value.days.every((day) => typeof day === "boolean") &&
    typeof value.enabled === "boolean"
  )
}

export function normalizeReminder(
  value: unknown,
  fallbackId: string
): AppReminder {
  if (!isRecord(value)) {
    throw new TypeError("Enter valid reminder settings.")
  }

  const id =
    typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(value.id)
      ? value.id
      : fallbackId
  const time = typeof value.time === "string" ? value.time : ""

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError("Enter valid reminder times.")
  }

  if (
    !Array.isArray(value.days) ||
    value.days.length !== 7 ||
    !value.days.every((day) => typeof day === "boolean")
  ) {
    throw new TypeError("Choose valid reminder days.")
  }

  return {
    id,
    time,
    days: [...value.days],
    enabled: value.enabled !== false,
  }
}

export function normalizeGlobalShortcut(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Enter a valid shortcut.")
  }

  const shortcut = value.trim()

  if (
    !/^(CmdOrCtrl|Cmd|Ctrl|Alt|Shift|Super)(\+(CmdOrCtrl|Cmd|Ctrl|Alt|Shift|Super))*\+([A-Z0-9]|F\d{1,2}|Enter|Esc|Up|Down|Left|Right|Tab|Space|Backspace|Delete)$/.test(
      shortcut
    )
  ) {
    throw new TypeError("Enter a valid shortcut like CmdOrCtrl+Shift+J.")
  }

  return shortcut
}

export function normalizeAppSettings(
  value: unknown,
  now = new Date()
): StoredAppSettings {
  if (!isRecord(value)) {
    throw new TypeError("Enter app settings.")
  }

  const reminders = Array.isArray(value.reminders)
    ? value.reminders.map((reminder, index) =>
        normalizeReminder(reminder, `r${index + 1}`)
      )
    : defaultAppSettings.reminders

  return {
    remindersEnabled: value.remindersEnabled !== false,
    notificationsEnabled: value.notificationsEnabled === true,
    reminders: reminders.slice(0, 8),
    launchAtLogin: value.launchAtLogin === true,
    globalShortcut:
      value.globalShortcut === undefined
        ? defaultAppSettings.globalShortcut
        : normalizeGlobalShortcut(value.globalShortcut),
    cacheTtlMinutes:
      typeof value.cacheTtlMinutes === "number" &&
      Number.isFinite(value.cacheTtlMinutes) &&
      value.cacheTtlMinutes > 0
        ? Math.min(60, Math.round(value.cacheTtlMinutes))
        : DEFAULT_CACHE_TTL_MINUTES,
    updatedAt: now.toISOString(),
  }
}

export function isStoredAppSettings(value: unknown): value is StoredAppSettings {
  return (
    isRecord(value) &&
    typeof value.remindersEnabled === "boolean" &&
    typeof value.notificationsEnabled === "boolean" &&
    Array.isArray(value.reminders) &&
    value.reminders.every(isReminder) &&
    typeof value.launchAtLogin === "boolean" &&
    typeof value.globalShortcut === "string" &&
    typeof value.cacheTtlMinutes === "number" &&
    typeof value.updatedAt === "string"
  )
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

export class TtlCache<TValue = unknown> {
  #entries = new Map<string, TtlCacheHit<TValue>>()

  get<T extends TValue = TValue>(key: string, now = Date.now()) {
    const cached = this.#entries.get(key) as TtlCacheHit<T> | undefined

    if (!cached || cached.expiresAt <= now) {
      return undefined
    }

    return cached
  }

  set(key: string, value: TValue, ttlMs: number, now = Date.now()) {
    this.#entries.set(key, { value, expiresAt: now + ttlMs })
  }

  delete(key: string) {
    this.#entries.delete(key)
  }

  deletePrefix(prefix: string) {
    for (const key of this.#entries.keys()) {
      if (key.startsWith(prefix)) {
        this.#entries.delete(key)
      }
    }
  }

  clear() {
    this.#entries.clear()
  }

  get size() {
    return this.#entries.size
  }
}

export function dayIndexFor(value: Date) {
  return (value.getDay() + 6) % 7
}

export function nextReminderDate(reminder: AppReminder, now = new Date()) {
  const [hours, minutes] = reminder.time.split(":").map(Number)

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      hours,
      minutes,
      0,
      0
    )

    if (candidate <= now || !reminder.days[dayIndexFor(candidate)]) {
      continue
    }

    return candidate
  }

  return null
}
