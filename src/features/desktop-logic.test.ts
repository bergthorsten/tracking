import { describe, expect, it } from "vitest"

import {
  defaultAppSettings,
  jiraWorklogPayload,
  nextReminderDate,
  normalizeAppSettings,
  TtlCache,
  type AppReminder,
} from "./desktop-logic"

describe("jiraWorklogPayload", () => {
  it("preserves the selected local date and time in Jira started format", () => {
    const payload = jiraWorklogPayload({
      minutes: 15,
      started: new Date(2026, 0, 2, 3, 4, 5, 6),
    })

    expect(payload.timeSpentSeconds).toBe(900)
    expect(payload.started).toMatch(
      /^2026-01-02T03:04:05\.006[+-]\d{4}$/
    )
  })

  it("maps notes to Jira ADF paragraphs", () => {
    const payload = jiraWorklogPayload({
      minutes: 30,
      started: new Date(2026, 6, 6, 11, 30),
      note: "Investigated\nFixed",
    })

    expect(payload.comment).toEqual({
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Investigated" }] },
        { type: "paragraph", content: [{ type: "text", text: "Fixed" }] },
      ],
    })
  })
})

describe("TtlCache", () => {
  it("returns fresh entries and expires stale entries", () => {
    const cache = new TtlCache<string>()

    cache.set("profile", "Ada", 100, 1_000)

    expect(cache.get("profile", 1_050)?.value).toBe("Ada")
    expect(cache.get("profile", 1_101)).toBeUndefined()
  })

  it("invalidates matching prefixes only", () => {
    const cache = new TtlCache<string>()

    cache.set("issues:", "recent", 100, 1_000)
    cache.set("issues:abc", "search", 100, 1_000)
    cache.set("worklogs:2026-07", "month", 100, 1_000)

    cache.deletePrefix("issues:")

    expect(cache.get("issues:", 1_001)).toBeUndefined()
    expect(cache.get("issues:abc", 1_001)).toBeUndefined()
    expect(cache.get("worklogs:2026-07", 1_001)?.value).toBe("month")
  })
})

describe("normalizeAppSettings", () => {
  it("normalizes persisted preferences", () => {
    const now = new Date("2026-07-06T12:00:00.000Z")
    const settings = normalizeAppSettings(
      {
        remindersEnabled: false,
        notificationsEnabled: true,
        reminders: [
          {
            id: "morning",
            time: "09:15",
            days: [true, true, true, true, true, false, false],
            enabled: true,
          },
        ],
        launchAtLogin: true,
        globalShortcut: "CmdOrCtrl+Shift+L",
        cacheTtlMinutes: 120,
      },
      now
    )

    expect(settings).toMatchObject({
      remindersEnabled: false,
      notificationsEnabled: true,
      launchAtLogin: true,
      globalShortcut: "CmdOrCtrl+Shift+L",
      cacheTtlMinutes: 60,
      updatedAt: now.toISOString(),
    })
    expect(settings.reminders).toHaveLength(1)
  })

  it("rejects invalid reminder times and shortcuts", () => {
    expect(() =>
      normalizeAppSettings({
        ...defaultAppSettings,
        reminders: [{ ...defaultAppSettings.reminders[0], time: "25:00" }],
      })
    ).toThrow("Enter valid reminder times.")

    expect(() =>
      normalizeAppSettings({
        ...defaultAppSettings,
        globalShortcut: "J",
      })
    ).toThrow("Enter a valid shortcut")
  })
})

describe("nextReminderDate", () => {
  const weekdayReminder: AppReminder = {
    id: "r1",
    time: "11:30",
    days: [true, true, true, true, true, false, false],
    enabled: true,
  }

  it("schedules later today when the reminder time has not passed", () => {
    const next = nextReminderDate(
      weekdayReminder,
      new Date(2026, 6, 6, 10, 0)
    )

    expect(next?.getFullYear()).toBe(2026)
    expect(next?.getMonth()).toBe(6)
    expect(next?.getDate()).toBe(6)
    expect(next?.getHours()).toBe(11)
    expect(next?.getMinutes()).toBe(30)
  })

  it("skips disabled days", () => {
    const next = nextReminderDate(
      weekdayReminder,
      new Date(2026, 6, 10, 12, 0)
    )

    expect(next?.getDay()).toBe(1)
    expect(next?.getDate()).toBe(13)
  })
})
