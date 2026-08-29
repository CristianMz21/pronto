import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200', className)} {...props} />
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 animate-pulse">
      <div className="h-4 w-3/5 bg-gray-200 rounded" />
      <div className="h-3 w-4/5 bg-gray-100 rounded" />
      <div className="h-8 w-full bg-gray-100 rounded-lg" />
    </div>
  )
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-8 bg-gray-100 rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-white border border-gray-200 rounded-lg" />
      ))}
    </div>
  )
}

function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-32 bg-white border border-gray-200 rounded-xl" />
      ))}
    </div>
  )
}

export { CardSkeleton, GridSkeleton, Skeleton, TableSkeleton }
