import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  {
    // Flat config only auto-ignores node_modules — build output and any
    // stray untracked artifact directories need to be excluded explicitly,
    // or eslint lints generated/minified JS as if it were source.
    ignores: ['.next/**', '.next-*/**', 'public/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals'),
]

export default eslintConfig
