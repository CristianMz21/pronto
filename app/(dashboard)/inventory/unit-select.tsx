'use client'

const PRESET_UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'bottle', 'box', 'pack']

interface Props {
  value: string
  onChange: (v: string) => void
  className?: string
}

export function UnitSelect({ value, onChange, className = '' }: Props) {
  const isOther = value !== '' && !PRESET_UNITS.includes(value)
  const selectVal = isOther ? 'other' : value

  return (
    <div className={`space-y-1.5 ${className}`}>
      <select
        value={selectVal}
        onChange={(e) => {
          if (e.target.value === 'other') onChange('')
          else onChange(e.target.value)
        }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {PRESET_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value="other">other…</option>
      </select>
      {selectVal === 'other' && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter unit name"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  )
}
