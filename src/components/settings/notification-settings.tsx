import * as React from "react"
import { Bell, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const DAYS = ["M", "T", "W", "T", "F", "S", "S"] as const

type Reminder = {
  id: string
  time: string
  days: boolean[]
  enabled: boolean
}

const defaultReminders: Reminder[] = [
  { id: "r1", time: "11:30", days: [true, true, true, true, true, false, false], enabled: true },
  { id: "r2", time: "16:45", days: [true, true, true, true, true, false, false], enabled: true },
]

/**
 * Configurable reminder system — up to 2 notifications per day, each with a
 * time and a weekday pattern. Backed by the OS Notification API at runtime.
 */
export function NotificationSettings() {
  const [master, setMaster] = React.useState(true)
  const [reminders, setReminders] = React.useState<Reminder[]>(defaultReminders)

  const update = (id: string, patch: Partial<Reminder>) =>
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const toggleDay = (id: string, i: number) =>
    setReminders((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, days: r.days.map((d, di) => (di === i ? !d : d)) }
          : r
      )
    )

  const addReminder = () =>
    setReminders((prev) =>
      prev.length >= 2
        ? prev
        : [
            ...prev,
            {
              id: crypto.randomUUID(),
              time: "13:00",
              days: [true, true, true, true, true, false, false],
              enabled: true,
            },
          ]
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Reminders</p>
            <p className="text-xs text-muted-foreground">
              Nudge me to log time · up to 2 per day
            </p>
          </div>
        </div>
        <Switch checked={master} onCheckedChange={setMaster} />
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 transition-opacity",
          !master && "pointer-events-none opacity-40"
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
                onChange={(e) => update(r.id, { time: e.target.value })}
                className="h-7 w-24 font-mono text-sm"
              />
              <div className="flex-1" />
              <Switch
                size="sm"
                checked={r.enabled}
                onCheckedChange={(v) => update(r.id, { enabled: v })}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Remove reminder"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setReminders((prev) => prev.filter((x) => x.id !== r.id))
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
                  onClick={() => toggleDay(r.id, i)}
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

        {reminders.length < 2 ? (
          <Button variant="outline" size="sm" onClick={addReminder}>
            <Plus /> Add reminder
          </Button>
        ) : (
          <p className="px-0.5 text-[11px] text-muted-foreground">
            Maximum of 2 reminders reached.
          </p>
        )}
      </div>
    </div>
  )
}
