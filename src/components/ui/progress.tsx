import { cn } from "@/lib/utils"

type ProgressProps = {
  value?: number
  className?: string
}

export function Progress({ value, className }: ProgressProps) {
  const normalizedValue = value === undefined ? undefined : Math.min(Math.max(value, 0), 100)

  return (
    <div
      data-slot="progress"
      className={cn("bg-muted relative h-2.5 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
    >
      {normalizedValue === undefined ? (
        <div className="bg-primary absolute inset-y-0 w-1/3 animate-pulse rounded-full" />
      ) : (
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200"
          style={{ width: `${normalizedValue}%` }}
        />
      )}
    </div>
  )
}
