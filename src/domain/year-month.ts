export interface YearMonthRange {
  start: Date
  end: Date
}

export function yearMonthRange(
  value: string | null | undefined,
  now = new Date()
): YearMonthRange {
  const match = value?.match(/^(\d{4})-(\d{1,2})$/)
  const year = match ? Number(match[1]) : now.getFullYear()
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth()

  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 1),
  }
}

export function yearMonthKey(
  value: string | null | undefined,
  now = new Date()
) {
  return yearMonthKeyFromDate(yearMonthRange(value, now).start)
}

export function yearMonthKeyFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`
}
