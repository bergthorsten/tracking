import { describe, expect, it } from "vitest"

import {
  defaultAppSettings,
  defaultReminderDays,
  normalizeAppSettings,
  normalizeAppSettingsUpdate,
  normalizeReminderDays,
  parseStoredAppSettings,
  type AppReminder,
} from "./app-settings"
import {
  isExactJiraIssueKey,
  isJiraKeySearch,
  normalizeJiraHost,
  normalizeJiraIssueKey,
  projectKeyFromIssueKey,
} from "./jira"
import { nextReminderDate } from "./reminders"
import {
  groupWorklogsByDay,
  localDateInputValue,
  normalizeCreateWorklogInput,
  normalizeLocalDate,
  normalizeStartedTime,
  jiraWorklogPayload,
  worklogCommentText,
} from "./time-tracking"
import { initialsFromName } from "./user"
import { yearMonthKey, yearMonthRange } from "./year-month"
import { TtlCache } from "../shared/cache"

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

describe("worklog input normalization", () => {
  it("accepts real local dates and rejects impossible dates", () => {
    expect(normalizeLocalDate("2026-02-28")).toEqual({
      year: 2026,
      month: 2,
      day: 28,
      value: "2026-02-28",
    })

    expect(() => normalizeLocalDate("2026-02-30")).toThrow(
      "Select a valid worklog date."
    )
    expect(() => normalizeLocalDate("2026-2-3")).toThrow(
      "Select a valid worklog date."
    )
  })

  it("formats local date input values", () => {
    expect(localDateInputValue(new Date(2026, 6, 7))).toBe("2026-07-07")
  })

  it("normalizes omitted, HH:mm, and invalid started times", () => {
    expect(normalizeStartedTime("09:45")).toEqual({
      hours: 9,
      minutes: 45,
      seconds: 0,
      milliseconds: 0,
    })
    expect(normalizeStartedTime(undefined, new Date(2026, 6, 7, 8, 3, 2, 1))).toEqual(
      {
        hours: 8,
        minutes: 3,
        seconds: 2,
        milliseconds: 1,
      }
    )
    expect(() => normalizeStartedTime("24:00")).toThrow(
      "Select a valid started time."
    )
  })

  it("normalizes create worklog payload input", () => {
    const input = normalizeCreateWorklogInput({
      issueKey: "plat-123",
      ticketTitle: " Fix clock ",
      minutes: 44.6,
      date: "2026-07-07",
      startedTime: "09:15",
      note: " Done ",
    })

    expect(input).toMatchObject({
      issueKey: "PLAT-123",
      ticketTitle: "Fix clock",
      minutes: 45,
      date: "2026-07-07",
      note: "Done",
    })
    expect(input.started).toEqual(new Date(2026, 6, 7, 9, 15, 0, 0))
  })
})

describe("worklogCommentText", () => {
  it("extracts plain and Jira ADF comments", () => {
    expect(worklogCommentText("Plain note")).toBe("Plain note")
    expect(
      worklogCommentText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Investigated" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Fixed" }],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe("Investigated Fixed")
  })

  it("ignores empty or unsupported comments", () => {
    expect(worklogCommentText("")).toBeUndefined()
    expect(worklogCommentText({ type: "doc", content: [] })).toBeUndefined()
    expect(worklogCommentText(null)).toBeUndefined()
  })
})

describe("groupWorklogsByDay", () => {
  it("groups entries by relative day labels", () => {
    const groups = groupWorklogsByDay(
      [
        { id: "1", startedAt: "2026-07-07T08:00:00.000Z" },
        { id: "2", startedAt: "2026-07-06T08:00:00.000Z" },
        { id: "3", startedAt: "2026-07-07T09:00:00.000Z" },
      ],
      new Date("2026-07-07T12:00:00.000Z")
    )

    expect(groups[0][0]).toBe("Today")
    expect(groups[0][1].map((entry) => entry.id)).toEqual(["1", "3"])
    expect(groups[1][0]).toBe("Yesterday")
  })
})

describe("TtlCache", () => {
  it("returns fresh entries and expires stale entries", () => {
    const cache = new TtlCache<string>()

    cache.set("user", "Ada", 100, 1_000)

    expect(cache.get("user", 1_050)?.value).toBe("Ada")
    expect(cache.get("user", 1_101)).toBeUndefined()
  })

  it("invalidates matching prefixes only", () => {
    const cache = new TtlCache<string>()

    cache.set("group:", "recent", 100, 1_000)
    cache.set("group:abc", "search", 100, 1_000)
    cache.set("other:2026-07", "month", 100, 1_000)

    cache.deletePrefix("group:")

    expect(cache.get("group:", 1_001)).toBeUndefined()
    expect(cache.get("group:abc", 1_001)).toBeUndefined()
    expect(cache.get("other:2026-07", 1_001)?.value).toBe("month")
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
            days: [...defaultReminderDays],
            enabled: true,
          },
        ],
        launchAtLogin: true,
        cacheTtlMinutes: 120,
      },
      now
    )

    expect(settings).toMatchObject({
      remindersEnabled: false,
      notificationsEnabled: true,
      launchAtLogin: true,
      cacheTtlMinutes: 60,
      updatedAt: now.toISOString(),
    })
    expect(settings.reminders).toHaveLength(1)
  })

  it("rejects invalid reminder times", () => {
    expect(() =>
      normalizeAppSettings({
        ...defaultAppSettings,
        reminders: [{ ...defaultAppSettings.reminders[0], time: "25:00" }],
      })
    ).toThrow("Enter valid reminder times.")
  })

  it("migrates legacy boolean reminder days to named weekdays", () => {
    expect(
      normalizeReminderDays([true, true, true, true, true, false, false])
    ).toEqual(defaultReminderDays)
  })

  it("merges app settings patches and owns updatedAt", () => {
    const current = normalizeAppSettings(defaultAppSettings, new Date(0))
    const now = new Date("2026-07-06T12:00:00.000Z")

    const settings = normalizeAppSettingsUpdate(
      current,
      {
        notificationsEnabled: true,
        updatedAt: "client-owned-value",
      },
      now
    )

    expect(settings).toMatchObject({
      notificationsEnabled: true,
      remindersEnabled: current.remindersEnabled,
      updatedAt: now.toISOString(),
    })
  })

  it("rejects invalid persisted reminder times while parsing stored settings", () => {
    expect(
      parseStoredAppSettings({
        ...defaultAppSettings,
        reminders: [{ ...defaultAppSettings.reminders[0], time: "99:99" }],
      })
    ).toBeNull()
  })

  it("preserves valid persisted updatedAt values", () => {
    const updatedAt = "2026-07-06T12:00:00.000Z"

    expect(
      parseStoredAppSettings({ ...defaultAppSettings, updatedAt })?.updatedAt
    ).toBe(updatedAt)
  })
})

describe("normalizeJiraHost", () => {
  it("normalizes HTTPS Jira hosts", () => {
    expect(normalizeJiraHost("Example.atlassian.net/")).toBe(
      "example.atlassian.net"
    )
    expect(normalizeJiraHost("https://jira.example.com:8443")).toBe(
      "jira.example.com:8443"
    )
  })

  it("rejects paths, credentials, non-HTTPS URLs, and malformed hosts", () => {
    expect(() => normalizeJiraHost("https://jira.example.com/path")).toThrow(
      "Enter only the Jira site host."
    )
    expect(() => normalizeJiraHost("https://u:p@jira.example.com")).toThrow(
      "Enter only the Jira site host."
    )
    expect(() => normalizeJiraHost("http://jira.example.com")).toThrow(
      "Use an HTTPS Jira site."
    )
    expect(() => normalizeJiraHost("https://jira.example.com/a b")).toThrow()
  })
})

describe("normalizeJiraIssueKey", () => {
  it("uppercases valid Jira issue keys", () => {
    expect(normalizeJiraIssueKey("abc-123")).toBe("ABC-123")
  })

  it("rejects invalid Jira issue keys", () => {
    expect(() => normalizeJiraIssueKey("A-1")).toThrow(
      "Choose a valid Jira ticket."
    )
    expect(() => normalizeJiraIssueKey("ABC-0x1")).toThrow(
      "Choose a valid Jira ticket."
    )
  })
})

describe("jira display helpers", () => {
  it("extracts project keys and detects key-search input", () => {
    expect(projectKeyFromIssueKey("PLAT-123")).toBe("PLAT")
    expect(projectKeyFromIssueKey("", "APP")).toBe("APP")
    expect(isJiraKeySearch("plat-")).toBe(true)
    expect(isJiraKeySearch("not a key")).toBe(false)
    expect(isExactJiraIssueKey("plat-123")).toBe(true)
    expect(isExactJiraIssueKey("plat-")).toBe(false)
  })
})

describe("year month helpers", () => {
  it("formats explicit and fallback month keys", () => {
    expect(yearMonthKey("2026-7")).toBe("2026-07")
    expect(yearMonthKey(null, new Date(2026, 6, 9))).toBe("2026-07")
  })

  it("returns local month ranges", () => {
    const range = yearMonthRange("2026-07")

    expect(range.start).toEqual(new Date(2026, 6, 1))
    expect(range.end).toEqual(new Date(2026, 7, 1))
  })
})

describe("nextReminderDate", () => {
  const weekdayReminder: AppReminder = {
    id: "r1",
    time: "11:30",
    days: [...defaultReminderDays],
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

  it("rolls over to the next enabled week", () => {
    const next = nextReminderDate(
      { ...weekdayReminder, days: ["mon"] },
      new Date(2026, 6, 6, 12, 0)
    )

    expect(next?.getDay()).toBe(1)
    expect(next?.getDate()).toBe(13)
  })
})

describe("initialsFromName", () => {
  it("handles full names, single names, whitespace, and email fallback", () => {
    expect(initialsFromName("Ada Lovelace")).toBe("AL")
    expect(initialsFromName("prince")).toBe("PR")
    expect(initialsFromName("  Grace   Hopper  ")).toBe("GH")
    expect(initialsFromName("user@example.com")).toBe("US")
    expect(initialsFromName("   ")).toBe("?")
  })
})
