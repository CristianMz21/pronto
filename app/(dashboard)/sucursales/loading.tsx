import { Skeleton, GridSkeleton } from '@/components/ui/skeleton'
export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <GridSkeleton count={2} />
    </div>
  )
}
