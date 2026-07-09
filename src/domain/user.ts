export function initialsFromName(value: string) {
  const name = value.trim()

  if (!name) {
    return "?"
  }

  const parts = name.split(/\s+/).filter(Boolean)
  const initials =
    parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)

  return initials.toUpperCase()
}
