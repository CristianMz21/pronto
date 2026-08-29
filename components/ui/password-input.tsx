'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
}

export function PasswordInput({ label, id, placeholder, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
