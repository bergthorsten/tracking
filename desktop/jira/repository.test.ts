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
})

function fakeClient(
  request: (input: string | URL | Request) => Promise<Response>
): JiraClient {
  return {
    request: async (_settings, input) => request(input),
  }
}
