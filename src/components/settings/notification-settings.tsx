import { Bell, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { AppReminder, FeatureStatus } from "@/desktop-bindings"
import { cn } from "@/lib/utils"

const DAYS = ["M", "T", "W", "T", "F", "S", "S"] as const

export function NotificationSettings({
  enabled,
  remindersEnabled,
  reminders,
  notificationStatus,
  saving,
  onToggleNotifications,
  onToggleReminders,
  onChangeReminders,
}: {
  enabled: boolean
  remindersEnabled: boolean
  reminders: AppReminder[]
  notificationStatus?: FeatureStatus
  saving?: boolean
  onToggleNotifications: (enabled: boolean) => void
  onToggleReminders: (enabled: boolean) => void
  onChangeReminders: (reminders: AppReminder[]) => void
}) {
  const supported = notificationStatus?.supported !== false
  const active = enabled && supported
  const controlsEnabled = active && remindersEnabled && !saving
  const subtitle = !supported
    ? notificationStatus?.message || "Native notifications are unavailable"
    : notificationStatus?.permission === "denied"
      ? "Notifications are denied in system settings"
      : enabled
        ? "Native notifications are enabled"
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
        days: [true, true, true, true, true, false, false],
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
          {notificationStatus?.permission ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {notificationStatus.permission}
            </span>
          ) : null}
          <Switch
            checked={enabled}
            disabled={!supported || saving}
            onCheckedChange={onToggleNotifications}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card/40 p-2.5">
        <div>
          <p className="text-sm font-medium">Scheduled reminders</p>
          <p className="text-xs text-muted-foreground">
            Fire at selected local times
          </p>
        </div>
        <Switch
          checked={remindersEnabled}
          disabled={!active || saving}
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
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!controlsEnabled}
                  onClick={() => {
                    const days = [...r.days]
                    days[i] = !days[i]
                    updateReminder(r.id, { days })
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md text-[11px] font-medium transition-colors",
                    r.days[i]
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        ))}

        <Button
          size="xs"
          variant="outline"
          disabled={!controlsEnabled || reminders.length >= 8}
          onClick={addReminder}
          className="self-start"
        >
          <Plus /> Add reminder
        </Button>
      </div>
    </div>
  )
}
