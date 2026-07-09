const EXACT_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/

export function normalizeJiraHost(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Enter a Jira site.")
  }

  const raw = value.trim().replace(/\/+$/, "")
  const href = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL

  try {
    url = new URL(href)
  } catch {
    throw new TypeError("Enter a valid Jira site.")
  }

  if (url.protocol !== "https:" || !url.hostname) {
    throw new TypeError("Use an HTTPS Jira site.")
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("Enter only the Jira site host.")
  }

  const host = url.host.toLowerCase()

  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) {
    throw new TypeError("Enter a valid Jira site.")
  }

  return host
}

export function normalizeJiraIssueKey(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Choose a Jira ticket.")
  }

  const issueKey = value.trim().toUpperCase()

  if (!isExactJiraIssueKey(issueKey)) {
    throw new TypeError("Choose a valid Jira ticket.")
  }

  return issueKey
}

export function projectKeyFromIssueKey(value: string, fallback = "JIRA") {
  return value.split("-")[0] || fallback
}

export function isJiraKeySearch(value: string) {
  return /^[A-Za-z][A-Za-z0-9]+-/.test(value.trim())
}

export function isExactJiraIssueKey(value: string) {
  return EXACT_ISSUE_KEY_PATTERN.test(value.trim().toUpperCase())
}
