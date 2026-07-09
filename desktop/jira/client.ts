export interface JiraCredentials {
  host: string
  email: string
  token: string
}

export type JiraFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export interface JiraRequestInit extends RequestInit {
  action: string
  networkErrorMessage?: string
}

export class JiraHttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "JiraHttpError"
    this.status = status
  }
}

export function basicAuthValue(email: string, token: string) {
  const bytes = new TextEncoder().encode(`${email}:${token}`)
  let value = ""

  for (const byte of bytes) {
    value += String.fromCharCode(byte)
  }

  return `Basic ${btoa(value)}`
}

export function jiraHeaders(settings: JiraCredentials) {
  return {
    accept: "application/json",
    authorization: basicAuthValue(settings.email, settings.token),
  }
}

export function retryAfterMessage(value: string | null, now = Date.now()) {
  if (!value) {
    return "Try again in a minute."
  }

  const seconds = Number(value)

  if (Number.isFinite(seconds) && seconds > 0) {
    return `Try again in ${Math.ceil(seconds)} seconds.`
  }

  const date = Date.parse(value)

  if (Number.isFinite(date)) {
    const secondsFromNow = Math.max(1, Math.ceil((date - now) / 1000))

    return `Try again in ${secondsFromNow} seconds.`
  }

  return "Try again in a minute."
}

export function jiraError(response: Response, action: string, now = Date.now()) {
  if (response.status === 401 || response.status === 403) {
    return new JiraHttpError(
      "Jira rejected the saved credentials or you do not have permission.",
      response.status
    )
  }

  if (response.status === 429) {
    return new JiraHttpError(
      `Jira rate-limited this request while ${action}. ${retryAfterMessage(
        response.headers.get("retry-after"),
        now
      )}`,
      response.status
    )
  }

  return new JiraHttpError(
    `Jira returned ${response.status} while ${action}.`,
    response.status
  )
}

export function isTerminalJiraError(error: unknown) {
  return (
    error instanceof JiraHttpError && [401, 403, 429].includes(error.status)
  )
}

function jiraUrl(settings: JiraCredentials, input: string | URL | Request) {
  if (typeof input !== "string") {
    return input
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    return new URL(input)
  }

  return new URL(input, `https://${settings.host}`)
}

function requestHeaders(settings: JiraCredentials, headers?: HeadersInit) {
  const merged = new Headers(jiraHeaders(settings))

  if (headers) {
    new Headers(headers).forEach((value, key) => merged.set(key, value))
  }

  return merged
}

export function createJiraClient({
  fetch: fetchImpl = fetch,
  now = Date.now,
}: {
  fetch?: JiraFetch
  now?: () => number
} = {}) {
  return {
    async request(
      settings: JiraCredentials,
      input: string | URL | Request,
      { action, networkErrorMessage, headers, ...init }: JiraRequestInit
    ) {
      let response: Response

      try {
        response = await fetchImpl(jiraUrl(settings, input), {
          ...init,
          headers: requestHeaders(settings, headers),
        })
      } catch (error) {
        if (networkErrorMessage) {
          throw new Error(networkErrorMessage, { cause: error })
        }

        throw error
      }

      if (!response.ok) {
        throw jiraError(response, action, now())
      }

      return response
    },
  }
}
