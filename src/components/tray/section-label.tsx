import { cn } from "@/lib/utils"

/** Sticky, uppercase section divider used inside the scrollable lists. */
export function SectionLabel({
  children,
  right,
  className,
}: {
  children: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 pt-3 pb-1.5",
        className
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {children}
      </span>
      {right ? (
        <span className="text-[11px] text-muted-foreground">{right}</span>
      ) : null}
    </div>
  )
}
