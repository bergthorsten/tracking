import * as React from "react"
import { CalendarDays } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { MONTHLY_TARGET_MINUTES } from "@/data/domain"
import { getDesktopBindings } from "@/desktop-bindings"
import { formatDuration, monthLabel } from "@/lib/time"

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, index) => {
  const date = new Date()
  date.setMonth(date.getMonth() - index, 1)
  const year = date.getFullYear()
  const month = date.getMonth()

  return {
    value: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: monthLabel(year, month),
  }
})

/**
 * Footer summary: tracked time for the selected month with a target
 * progress bar. The month is switchable to review previous months.
 */
export function MonthSummary({ refreshKey = 0 }: { refreshKey?: number }) {
  const [month, setMonth] = React.useState(MONTH_OPTIONS[0]?.value)
  const [liveTotal, setLiveTotal] = React.useState<number | null>(null)
  const desktopBindings = React.useMemo(() => getDesktopBindings(), [])
  const total = liveTotal ?? 0
  const pct = Math.min(100, Math.round((total / MONTHLY_TARGET_MINUTES) * 100))

  React.useEffect(() => {
    if (!desktopBindings || !month) {
      return
    }

    let cancelled = false

    void desktopBindings
      .loadJiraWorklogs(month)
      .then((result) => {
        if (!cancelled) {
          setLiveTotal(result.totalMinutes)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveTotal(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [desktopBindings, month, refreshKey])

  return (
    <div className="border-t bg-card/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <Select
          value={month}
          onValueChange={(v) => {
            if (!v) {
              return
            }

            setLiveTotal(null)
            setMonth(v)
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-7 gap-1.5 border-0 bg-transparent px-1.5 font-medium hover:bg-muted"
          >
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {MONTH_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-right">
          {liveTotal === null ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : (
            <>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatDuration(total)}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">
                / {MONTHLY_TARGET_MINUTES / 60}h
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Progress value={pct} className="flex-1" />
        <span className="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {pct}%
        </span>
      </div>
    </div>
  )
}
