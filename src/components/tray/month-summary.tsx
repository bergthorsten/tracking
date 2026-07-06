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
import { MONTH_TOTALS, MONTHLY_TARGET_MINUTES } from "@/data/mock"
import { formatDuration, monthLabel } from "@/lib/time"

const MONTH_OPTIONS = Object.keys(MONTH_TOTALS).map((k) => {
  const [y, m] = k.split("-").map(Number)
  return { value: k, label: monthLabel(y, m) }
})

/**
 * Footer summary: tracked time for the selected month with a target
 * progress bar. The month is switchable to review previous months.
 */
export function MonthSummary() {
  const [month, setMonth] = React.useState(MONTH_OPTIONS[0]?.value)
  const total = MONTH_TOTALS[month] ?? 0
  const pct = Math.min(100, Math.round((total / MONTHLY_TARGET_MINUTES) * 100))

  return (
    <div className="border-t bg-card/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
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
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatDuration(total)}
          </span>
          <span className="ml-1 text-xs text-muted-foreground">
            / {MONTHLY_TARGET_MINUTES / 60}h
          </span>
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
