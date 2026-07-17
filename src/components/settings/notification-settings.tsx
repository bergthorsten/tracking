import { Bell, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { AppReminder, FeatureStatus } from "@/desktop-bindings"
import {
  defaultReminderDays,
  weekdays,
  type Weekday,
} from "@/domain/app-settings"
import { cn } from "@/lib/utils"

export function NotificationSettings({
  enabled,
  remindersEnabled,
  reminders,
  notificationStatus,
  saving,
  testing,
  onToggleNotifications,
  onToggleReminders,
  onChangeReminders,
  onSendTest,
  onOpenSystemSettings,
  onRefreshStatus,
}: {
  enabled: boolean
  remindersEnabled: boolean
  reminders: AppReminder[]
  notificationStatus?: FeatureStatus
  saving?: boolean
  testing?: boolean
  onToggleNotifications: (enabled: boolean) => void
  onToggleReminders: (enabled: boolean) => void
  onChangeReminders: (reminders: AppReminder[]) => void
  onSendTest?: () => void
  onOpenSystemSettings?: () => void
  onRefreshStatus?: () => void
}) {
  const supported = notificationStatus?.supported !== false
  const permission = notificationStatus?.permission
  const denied = permission === "denied"
  const granted = permission === "granted"
  const active = enabled && supported && !denied
  const controlsEnabled = active && remindersEnabled
  const busy = saving || testing
  const subtitle = !supported
    ? notificationStatus?.message || "Native notifications are unavailable"
    : denied
      ? notificationStatus?.message ||
        "Notifications are blocked in system settings"
      : enabled
        ? notificationStatus?.message ||
          "Reminders fire while the app is running"
        : "Enable native notifications for reminders"

  const updateReminder = (id: string, next: Partial<AppReminder>) => {
    onChangeReminders(
      reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, ...next } : reminder
      )
    )
  }

  const addReminder = () => {
    onChangeReminders([
      ...reminders,
      {
        id: `r${Date.now().toString(36)}`,
        time: "16:45",
        days: [...defaultReminderDays],
        enabled: true,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Reminders</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {permission ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                denied
                  ? "bg-destructive/15 text-destructive"
                  : granted
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {permission}
            </span>
          ) : null}
          <Switch
            checked={enabled && !denied}
            disabled={!supported || busy || denied}
            onCheckedChange={onToggleNotifications}
          />
        </div>
      </div>

      {supported && (denied || onSendTest || onOpenSystemSettings) ? (
        <div className="flex flex-wrap gap-1.5">
          {denied || permission === "default" ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy || !onOpenSystemSettings}
              onClick={onOpenSystemSettings}
            >
              <ExternalLink /> Open system settings
            </Button>
          ) : null}
          {denied || permission === "default" ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={busy || !onRefreshStatus}
              onClick={onRefreshStatus}
            >
              <RefreshCw /> Check again
            </Button>
          ) : null}
          {granted && enabled && onSendTest ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={onSendTest}
            >
              <Bell /> Send test
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border bg-card/40 p-2.5">
        <div>
          <p className="text-sm font-medium">Scheduled reminders</p>
          <p className="text-xs text-muted-foreground">
            Fire at selected local times while the app is running
          </p>
        </div>
        <Switch
          checked={remindersEnabled}
          disabled={!active || busy}
          onCheckedChange={onToggleReminders}
        />
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 transition-opacity",
          !controlsEnabled && "pointer-events-none opacity-45"
        )}
      >
        {reminders.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2.5 rounded-lg border bg-card/40 p-2.5"
          >
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={r.time}
                disabled={!controlsEnabled}
                onChange={(event) =>
                  updateReminder(r.id, { time: event.currentTarget.value })
                }
                className="h-7 w-24 font-mono text-sm"
              />
              <div className="flex-1" />
              <Switch
                size="sm"
                checked={r.enabled}
                disabled={!controlsEnabled}
                onCheckedChange={(enabled) => updateReminder(r.id, { enabled })}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Remove reminder"
                className="text-muted-foreground hover:text-destructive"
                disabled={!controlsEnabled || reminders.length <= 1}
                onClick={() =>
                  onChangeReminders(
                    reminders.filter((reminder) => reminder.id !== r.id)
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              {weekdays.map(({ value, shortLabel }) => {
                const selected = r.days.includes(value)

                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!controlsEnabled}
                    onClick={() =>
                      updateReminder(r.id, {
                        days: toggleReminderDay(r.days, value),
                      })
                    }
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md text-[11px] font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    {shortLabel}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <Button
          size="xs"
          variant="outline"
          disabled={!controlsEnabled || busy || reminders.length >= 8}
          onClick={addReminder}
          className="self-start"
        >
          <Plus /> Add reminder
        </Button>
      </div>
    </div>
  )
}

function toggleReminderDay(days: Weekday[], day: Weekday) {
  return days.includes(day)
    ? days.filter((selectedDay) => selectedDay !== day)
    : [...days, day]
}
