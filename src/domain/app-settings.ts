export const DEFAULT_CACHE_TTL_MINUTES = 5

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export const weekdays: ReadonlyArray<{
  value: Weekday
  shortLabel: string
}> = [
  { value: "mon", shortLabel: "M" },
  { value: "tue", shortLabel: "T" },
  { value: "wed", shortLabel: "W" },
  { value: "thu", shortLabel: "T" },
  { value: "fri", shortLabel: "F" },
  { value: "sat", shortLabel: "S" },
  { value: "sun", shortLabel: "S" },
]

export const defaultReminderDays: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
]

export interface AppReminder {
  id: string
  time: string
  days: Weekday[]
  enabled: boolean
}

export interface StoredAppSettings {
  remindersEnabled: boolean
  notificationsEnabled: boolean
  reminders: AppReminder[]
  launchAtLogin: boolean
  cacheTtlMinutes: number
  updatedAt: string
}

export type UpdateAppSettingsInput = Partial<Omit<StoredAppSettings, "updatedAt">>

export const defaultAppSettings: StoredAppSettings = {
  remindersEnabled: true,
  notificationsEnabled: false,
  reminders: [
    {
      id: "r1",
      time: "11:30",
      days: [...defaultReminderDays],
      enabled: true,
    },
    {
      id: "r2",
      time: "16:45",
      days: [...defaultReminderDays],
      enabled: true,
    },
  ],
  launchAtLogin: false,
  cacheTtlMinutes: DEFAULT_CACHE_TTL_MINUTES,
  updatedAt: new Date(0).toISOString(),
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

  const days = normalizeReminderDays(value.days)

  return {
    id,
    time,
    days,
    enabled: value.enabled !== false,
  }
}

export function normalizeReminderDays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Choose valid reminder days.")
  }

  if (value.every((day) => typeof day === "boolean")) {
    if (value.length !== weekdays.length) {
      throw new TypeError("Choose valid reminder days.")
    }

    return weekdays
      .filter((_, index) => value[index])
      .map((weekday) => weekday.value)
  }

  if (!value.every(isWeekday)) {
    throw new TypeError("Choose valid reminder days.")
  }

  const selected = new Set(value)

  return weekdays
    .map((weekday) => weekday.value)
    .filter((weekday) => selected.has(weekday))
}

function isWeekday(value: unknown): value is Weekday {
  return weekdays.some((weekday) => weekday.value === value)
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
    cacheTtlMinutes:
      typeof value.cacheTtlMinutes === "number" &&
      Number.isFinite(value.cacheTtlMinutes) &&
      value.cacheTtlMinutes > 0
        ? Math.min(60, Math.round(value.cacheTtlMinutes))
        : DEFAULT_CACHE_TTL_MINUTES,
    updatedAt: now.toISOString(),
  }
}

export function normalizeAppSettingsUpdate(
  current: StoredAppSettings,
  patch: unknown,
  now = new Date()
): StoredAppSettings {
  if (!isRecord(patch)) {
    throw new TypeError("Enter app settings.")
  }

  return normalizeAppSettings({ ...current, ...patch }, now)
}

export function parseStoredAppSettings(value: unknown): StoredAppSettings | null {
  if (!isRecord(value)) {
    return null
  }

  const updatedAt = parseSettingsUpdatedAt(value.updatedAt)

  try {
    return normalizeAppSettings(
      { ...defaultAppSettings, ...value },
      updatedAt ?? new Date()
    )
  } catch {
    return null
  }
}

function parseSettingsUpdatedAt(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}
