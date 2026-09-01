export default function Loading() {
  return (
    <div className="min-h-[40vh] p-4">
      <div className="max-w-lg mx-auto space-y-3">
        <div className="h-6 w-32 bg-gray-200 rounded-lg animate-pulse mx-auto" />
        <div className="h-28 bg-white rounded-xl border animate-pulse" />
        <div className="h-40 bg-white rounded-xl border animate-pulse" />
        <div className="h-24 bg-white rounded-xl border animate-pulse" />
      </div>
    </div>
  )
}
