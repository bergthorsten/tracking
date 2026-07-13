import { describe, expect, it } from "vitest"

import type { createJiraClient } from "./client"
import { JiraDataCache } from "./data-cache"
import { createJiraRepository, type StoredJiraSettings } from "./repository"

type JiraClient = ReturnType<typeof createJiraClient>

const settings: StoredJiraSettings = {
  host: "example.atlassian.net",
  email: "ada@example.com",
  token: "secret-token",
  updatedAt: "2026-07-01T00:00:00.000Z",
}

describe("createJiraRepository", () => {
  it("searches exact issue keys with fake Jira client inputs", async () => {
    const requests: string[] = []
    const repository = createJiraRepository({
      client: fakeClient(async (input) => {
        requests.push(String(input))

        return new Response(
          JSON.stringify({
            issues: [
              {
                key: "APP-1",
                fields: { summary: "Build cache", updated: "2026-07-01" },
              },
            ],
          })
        )
      }),
      cache: new JiraDataCache({ loadTtlMs: () => 1_000 }),
      saveSettings: async () => {},
    })

    const tickets = await repository.searchTickets(settings, "app-1")
    const url = new URL(requests[0])

    expect(url.searchParams.get("jql")).toBe("key = APP-1")
    expect(tickets).toEqual([
      {
        key: "APP-1",
        title: "Build cache",
        project: "APP",
        todayMinutes: 0,
        lastWorked: "2026-07-01",
      },
    ])
  })

  it("saves refreshed profile fields", async () => {
    let saved: StoredJiraSettings | undefined
    const repository = createJiraRepository({
      client: fakeClient(async () =>
        new Response(
          JSON.stringify({
            accountId: "abc123",
            displayName: "Ada Lovelace",
            avatarUrls: { "48x48": "https://avatar.example/48.png" },
          })
        )
      ),
      cache: new JiraDataCache({ loadTtlMs: () => 1_000 }),
      saveSettings: async (settings) => {
        saved = settings
      },
    })

    const profile = await repository.fetchProfile(settings)

    expect(profile).toMatchObject({
      accountId: "abc123",
      displayName: "Ada Lovelace",
      avatarUrl: "https://avatar.example/48.png",
    })
    expect(saved).toMatchObject({ accountId: "abc123" })
  })

  it("includes the current user's tracked time on recent tickets", async () => {
    const today = new Date()
    const todayStarted = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      9
    ).toISOString()
    const repository = createJiraRepository({
      client: fakeClient(async (input) => {
        const url = new URL(String(input))

        if (url.pathname.endsWith("/worklog")) {
          return Response.json({
            maxResults: 100,
            total: 3,
            worklogs: [
              {
                id: "1",
                author: { accountId: "me" },
                started: todayStarted,
                timeSpentSeconds: 30 * 60,
              },
              {
                id: "2",
                author: { accountId: "me" },
                started: "2026-06-01T09:00:00.000Z",
                timeSpentSeconds: 60 * 60,
              },
              {
                id: "3",
                author: { accountId: "someone-else" },
                started: todayStarted,
                timeSpentSeconds: 120 * 60,
              },
            ],
          })
        }

        if (url.searchParams.get("jql")?.includes("worklogAuthor")) {
          return Response.json({
            issues: Array.from({ length: 4 }, (_, index) => ({
              key: `APP-${index + 1}`,
              fields: { summary: "Build cache", updated: todayStarted },
            })),
          })
        }

        return Response.json({ issues: [] })
      }),
      cache: new JiraDataCache({ loadTtlMs: () => 1_000 }),
      saveSettings: async () => {},
    })

    const tickets = await repository.searchTickets(
      { ...settings, accountId: "me" },
      ""
    )

    expect(tickets).toHaveLength(4)
    expect(tickets[0]).toMatchObject({
      key: "APP-1",
      todayMinutes: 30,
      trackedMinutes: 90,
      lastWorked: todayStarted,
    })
  })
})

function fakeClient(
  request: (input: string | URL | Request) => Promise<Response>
): JiraClient {
  return {
    request: async (_settings, input) => request(input),
  }
}
