import { describe, expect, it } from "vitest"

import {
  createJiraClient,
  isTerminalJiraError,
  JiraHttpError,
  jiraHeaders,
  retryAfterMessage,
  type JiraCredentials,
  type JiraFetch,
} from "./client"

const settings: JiraCredentials = {
  host: "example.atlassian.net",
  email: "ada@example.com",
  token: "secret-token",
}

describe("jiraHeaders", () => {
  it("builds basic auth headers", () => {
    const headers = jiraHeaders(settings)

    expect(headers.accept).toBe("application/json")
    expect(atob(headers.authorization.replace(/^Basic /, ""))).toBe(
      "ada@example.com:secret-token"
    )
  })
})

describe("createJiraClient", () => {
  it("injects auth headers and resolves relative Jira URLs", async () => {
    let requestedUrl = ""
    let requestedHeaders: Headers | undefined
    const fetchImpl: JiraFetch = async (input, init) => {
      requestedUrl = String(input)
      requestedHeaders = new Headers(init?.headers)

      return new Response("{}")
    }

    await createJiraClient({ fetch: fetchImpl }).request(
      settings,
      "/rest/api/3/myself",
      { action: "loading profile" }
    )

    expect(requestedUrl).toBe("https://example.atlassian.net/rest/api/3/myself")
    expect(requestedHeaders?.get("accept")).toBe("application/json")
    expect(requestedHeaders?.get("authorization")).toMatch(/^Basic /)
  })

  it("maps credential and permission errors without leaking tokens", async () => {
    const fetchImpl: JiraFetch = async () =>
      new Response("", { status: 401, statusText: "Unauthorized" })

    await expect(
      createJiraClient({ fetch: fetchImpl }).request(
        settings,
        "/rest/api/3/myself",
        { action: "loading profile" }
      )
    ).rejects.toMatchObject({
      status: 401,
      message:
        "Jira rejected the saved credentials or you do not have permission.",
    })

    await expect(
      createJiraClient({ fetch: fetchImpl }).request(
        settings,
        "/rest/api/3/myself",
        { action: "loading profile" }
      )
    ).rejects.not.toThrow(settings.token)
  })

  it("maps rate limits with Retry-After seconds", async () => {
    const fetchImpl: JiraFetch = async () =>
      new Response("", { status: 429, headers: { "retry-after": "7.1" } })

    await expect(
      createJiraClient({ fetch: fetchImpl }).request(
        settings,
        "/rest/api/3/search/jql",
        { action: "loading issues" }
      )
    ).rejects.toThrow(
      "Jira rate-limited this request while loading issues. Try again in 8 seconds."
    )
  })

  it("maps rate limits with Retry-After HTTP dates", async () => {
    const fetchImpl: JiraFetch = async () =>
      new Response("", {
        status: 429,
        headers: { "retry-after": "Tue, 07 Jul 2026 00:00:12 GMT" },
      })

    await expect(
      createJiraClient({
        fetch: fetchImpl,
        now: () => Date.parse("2026-07-07T00:00:00.000Z"),
      }).request(settings, "/rest/api/3/search/jql", {
        action: "loading issues",
      })
    ).rejects.toThrow(
      "Jira rate-limited this request while loading issues. Try again in 12 seconds."
    )
  })

  it("uses explicit network messages when Jira cannot be reached", async () => {
    const fetchImpl: JiraFetch = async () => {
      throw new TypeError("fetch failed with secret-token")
    }

    await expect(
      createJiraClient({ fetch: fetchImpl }).request(
        settings,
        "/rest/api/3/myself",
        {
          action: "verifying credentials",
          networkErrorMessage:
            "Could not reach Jira. Check the site URL and your network.",
        }
      )
    ).rejects.toThrow("Could not reach Jira. Check the site URL and your network.")
  })
})

describe("retryAfterMessage", () => {
  it("falls back for empty or malformed Retry-After headers", () => {
    expect(retryAfterMessage(null)).toBe("Try again in a minute.")
    expect(retryAfterMessage("soon")).toBe("Try again in a minute.")
  })
})

describe("isTerminalJiraError", () => {
  it("treats credentials, permission, and rate-limit errors as terminal", () => {
    expect(isTerminalJiraError(new JiraHttpError("no", 401))).toBe(true)
    expect(isTerminalJiraError(new JiraHttpError("rate", 429))).toBe(true)
    expect(isTerminalJiraError(new JiraHttpError("server", 500))).toBe(false)
  })
})
