import {
  weekdays,
  type AppReminder,
  type Weekday,
} from "./app-settings.ts"

export function weekdayForDate(value: Date): Weekday {
  return weekdays[(value.getDay() + 6) % 7].value
}

export function nextReminderDate(reminder: AppReminder, now = new Date()) {
  const [hours, minutes] = reminder.time.split(":").map(Number)

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      hours,
      minutes,
      0,
      0
    )

    if (candidate <= now || !reminder.days.includes(weekdayForDate(candidate))) {
      continue
    }

    return candidate
  }

  return null
}
