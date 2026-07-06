import { cn } from "@/lib/utils"

/**
 * A macOS-style menu-bar popover frame with the little pointer notch,
 * used to present each screen at its true 400×600 window size.
 */
export function DeviceFrame({
  children,
  label,
  height = 600,
  className,
}: {
  children: React.ReactNode
  label?: string
  height?: number
  className?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div className={cn("relative w-[400px]", className)}>
        {/* pointer notch */}
        <div className="absolute -top-[7px] left-1/2 z-10 size-3.5 -translate-x-1/2 rotate-45 rounded-tl-sm border-t border-l border-border bg-background" />
        <div
          className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
          style={{ height }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
