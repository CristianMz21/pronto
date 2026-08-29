import { Skeleton } from '@/components/ui/skeleton'
export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <Skeleton className="h-6 w-32" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
