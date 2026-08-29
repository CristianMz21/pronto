'use client'

interface Props {
  value: string
  onChange: (v: string) => void
  categories: string[]
  placeholder?: string
  className?: string
}

// Native <datalist>-based combobox — autocomplete from existing categories,
// still allows typing any new value.
export function CategoryCombobox({
  value,
  onChange,
  categories,
  placeholder = 'e.g. Hair care',
  className = '',
}: Props) {
  const listId = 'inventory-categories-list'

  return (
    <>
      <input
        type="text"
        value={value}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )
}
