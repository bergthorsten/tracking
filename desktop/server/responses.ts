export function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("cache-control", "no-store")

  return new Response(JSON.stringify(value), { ...init, headers })
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not connect to Jira."
}
