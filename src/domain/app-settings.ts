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

export type UpdateAppSettingsInput = Partial<Omit<StoredAppSettings, "updatedAt">>

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
