import { describe, expect, it } from "vitest"

import { JiraDataCache } from "./data-cache"

describe("JiraDataCache", () => {
  it("returns cached values until the ttl expires", async () => {
    let now = 1_000
    let loads = 0
    const cache = new JiraDataCache({ loadTtlMs: () => 100, now: () => now })
    const load = async () => {
      loads += 1

      return [
        {
          key: "APP-1",
          title: "One",
          project: "APP",
          todayMinutes: 0,
          lastWorked: "2026-07-01",
        },
      ]
    }

    expect(await cache.getIssues("app", load)).toHaveLength(1)
    now = 1_050
    expect(await cache.getIssues("app", load)).toHaveLength(1)
    now = 1_101
    expect(await cache.getIssues("app", load)).toHaveLength(1)
    expect(loads).toBe(2)
  })

  it("invalidates issue searches and affected worklog months after worklog create", async () => {
    let now = Date.parse("2026-07-15T12:00:00.000Z")
    const cache = new JiraDataCache({ loadTtlMs: () => 10_000, now: () => now })
    let issueLoads = 0
    let createdMonthLoads = 0
    let otherMonthLoads = 0

    await cache.getIssues("app", async () => {
      issueLoads += 1

      return []
    })
    await cache.getWorklogs("2026-07", async () => {
      createdMonthLoads += 1

      return { month: "2026-07", totalMinutes: 0, logs: [] }
    })
    await cache.getWorklogs("2026-06", async () => {
      otherMonthLoads += 1

      return { month: "2026-06", totalMinutes: 0, logs: [] }
    })

    cache.invalidateAfterWorklogCreate("2026-07")
    now += 1

    await cache.getIssues("app", async () => {
      issueLoads += 1

      return []
    })
    await cache.getWorklogs("2026-07", async () => {
      createdMonthLoads += 1

      return { month: "2026-07", totalMinutes: 0, logs: [] }
    })
    await cache.getWorklogs("2026-06", async () => {
      otherMonthLoads += 1

      return { month: "2026-06", totalMinutes: 0, logs: [] }
    })

    expect(issueLoads).toBe(2)
    expect(createdMonthLoads).toBe(2)
    expect(otherMonthLoads).toBe(1)
  })
})
