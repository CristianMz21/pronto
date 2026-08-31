'use client'
type Tab =
  | 'general'
  | 'services'
  | 'employees'
  | 'notifications'
  | 'billing'
  | 'account'
  | 'modules'
  | 'advanced'

export function TabNavigation({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: Tab; label: string; icon?: React.ReactNode }[]
  active: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <div className="flex flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible gap-1 bg-gray-100 p-1 rounded-lg mb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {tabs.map((tb) => (
        <button
          type="button"
          key={tb.key}
          onClick={() => onChange(tb.key)}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${active === tb.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {tb.icon ? tb.icon : null}
          {tb.label}
        </button>
      ))}
    </div>
  )
}
