import { Skeleton, GridSkeleton } from '@/components/ui/skeleton'
export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <GridSkeleton count={3} />
    </div>
  )
}
