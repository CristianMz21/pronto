'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, CheckCircle, Upload, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isRecord } from '@/lib/validation/guard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  name: string
  phone: string
  email: string
  notes: string
}

type Step = 'platform' | 'upload' | 'result'

interface Props {
  open: boolean
  onClose: () => void
  onImported: (count: number) => void
}

// ─── Platform instructions ────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'fresha', label: 'Fresha', hint: 'Clients → Options (top right) → Export → CSV' },
  {
    id: 'vagaro',
    label: 'Vagaro',
    hint: 'More → Reports → Customers → Action → Export Excel, then save as CSV',
  },
  { id: 'booksy', label: 'Booksy', hint: 'Customers → More Options → Export → CSV' },
  { id: 'mindbody', label: 'Mindbody', hint: 'Reports → Clients → Mailing Lists → Export → CSV' },
  { id: 'square', label: 'Square', hint: 'Customers → Customer Directory → Export' },
  {
    id: 'other',
    label: 'Other',
    hint: 'Export your client list as CSV with columns: name, phone, email',
  },
] as const

// ─── CSV parser (no external libraries) ─────────────────────────────────────

function handleInQuotes(
  ch: string,
  next: string | undefined,
  field: string,
): { field: string; advance: number; stayInQuotes: boolean } | null {
  if (ch === '"' && next === '"') return { field: field + '"', advance: 2, stayInQuotes: true }
  if (ch === '"') return { field, advance: 1, stayInQuotes: false }
  return null
}

function handleDelimiter(
  ch: string,
  field: string,
  row: string[],
): { row: string[]; field: string; consumed: boolean } | null {
  if (ch !== ',') return null
  const nextRow = [...row, field.trim()]
  return { row: nextRow, field: '', consumed: true }
}

function handleNewline(
  ch: string,
  next: string | undefined,
  field: string,
  row: string[],
  rows: string[][],
): { row: string[]; field: string; rows: string[][]; advance: number } | null {
  if (ch === '\r' && next === '\n') {
    const nextRow = [...row, field.trim()]
    const nextRows = nextRow.some((c) => c !== '') ? [...rows, nextRow] : rows
    return { row: [], field: '', rows: nextRows, advance: 2 }
  }
  if (ch === '\n' || ch === '\r') {
    const nextRow = [...row, field.trim()]
    const nextRows = nextRow.some((c) => c !== '') ? [...rows, nextRow] : rows
    return { row: [], field: '', rows: nextRows, advance: 1 }
  }
  return null
}

function pushLastRow(field: string, row: string[], rows: string[][]): string[][] {
  if (field.length === 0 && row.length === 0) return rows
  const nextRow = [...row, field.trim()]
  if (!nextRow.some((c) => c !== '')) return rows
  return [...rows, nextRow]
}

function parseCSV(text: string): string[][] {
  let rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i] as string
    const next = text[i + 1]

    if (inQuotes) {
      const res = handleInQuotes(ch, next, field)
      if (res) {
        field = res.field
        inQuotes = res.stayInQuotes
        i += res.advance
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    const delim = handleDelimiter(ch, field, row)
    if (delim) {
      row = delim.row
      field = delim.field
      i++
      continue
    }

    const nl = handleNewline(ch, next, field, row, rows)
    if (nl) {
      row = nl.row
      field = nl.field
      rows = nl.rows
      i += nl.advance
      continue
    }

    field += ch
    i++
  }

  return pushLastRow(field, row, rows)
}

// ─── Column detection ─────────────────────────────────────────────────────────

function detectColumns(headers: string[]): {
  name: number
  phone: number
  email: number
  notes: number
} {
  const idx = (keywords: string[]) => {
    for (const kw of keywords) {
      const i = headers.findIndex((h) => h.toLowerCase().includes(kw.toLowerCase()))
      if (i !== -1) return i
    }
    return -1
  }

  return {
    name: idx(['name', 'full name', 'client name', 'customer name', 'contact name', 'first name']),
    phone: idx(['phone', 'mobile', 'cell', 'telephone', 'tel', 'number']),
    email: idx(['email', 'e-mail', 'mail']),
    notes: idx(['notes', 'note', 'comments', 'comment', 'memo']),
  }
}

function rowsToClients(rows: string[][], colMap: ReturnType<typeof detectColumns>): ParsedRow[] {
  return rows.map((row) => ({
    name: colMap.name >= 0 ? (row[colMap.name] ?? '') : '',
    phone: colMap.phone >= 0 ? (row[colMap.phone] ?? '') : '',
    email: colMap.email >= 0 ? (row[colMap.email] ?? '') : '',
    notes: colMap.notes >= 0 ? (row[colMap.notes] ?? '') : '',
  }))
}

// ─── Helpers for strict JSON borders ──────────────────────────────────────────
function getStringField(json: unknown, key: string): string | undefined {
  if (!isRecord(json)) return undefined
  const v = json[key]
  return typeof v === 'string' ? v : undefined
}
function getNumberField(json: unknown, key: string): number | undefined {
  if (!isRecord(json)) return undefined
  const v = json[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportCsvModal({ open, onClose, onImported }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('platform')
  const [platform, setPlatform] = useState<string | null>(null)
  const [dragging, setDragging] = useState<boolean>(false)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [colMap, setColMap] = useState<ReturnType<typeof detectColumns> | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rowCount, setRowCount] = useState<number>(0)
  const [noPhoneWarn, setNoPhoneWarn] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [resultImported, setResultImported] = useState<number>(0)
  const [resultSkipped, setResultSkipped] = useState<number>(0)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when closed
  function handleClose(): void {
    setStep('platform')
    setPlatform(null)
    setParsedRows([])
    setColMap(null)
    setHeaders([])
    setRowCount(0)
    setNoPhoneWarn(false)
    setLoading(false)
    setImportError(null)
    onClose()
  }

  // Process file
  const processFile = useCallback((file: File): void => {
    const reader = new FileReader()
    reader.onload = (e: ProgressEvent<FileReader>): void => {
      const raw = e.target?.result
      if (typeof raw !== 'string') {
        setImportError('Failed to read file.')
        return
      }
      const text: string = raw
      const matrix: string[][] = parseCSV(text)
      if (matrix.length < 2) {
        setImportError('File appears empty or could not be parsed.')
        return
      }
      const hdrs: string[] = (matrix[0] ?? []).map((c) => String(c))
      const dataRows: string[][] = matrix.slice(1)
      const map: ReturnType<typeof detectColumns> = detectColumns(hdrs)
      setHeaders(hdrs)
      setColMap(map)
      setRowCount(dataRows.length)
      setParsedRows(rowsToClients(dataRows, map))
      setNoPhoneWarn(map.phone === -1)
      setImportError(null)
      setStep('upload')
    }
    reader.onerror = (): void => {
      setImportError('Failed to read file.')
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const file: File | undefined = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragging(false)
    const file: File | undefined = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  async function handleImport(): Promise<void> {
    setLoading(true)
    setImportError(null)
    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: parsedRows }),
      })
      const json: unknown = await res.json()

      if (res.status === 402) {
        const limit = getNumberField(json, 'limit')
        const limitStr = limit !== undefined ? String(limit) : 'client'
        setImportError(
          `You've reached the ${limitStr}-client limit on the Free plan. Upgrade to Starter to import unlimited clients.`,
        )
        setLoading(false)
        return
      }
      if (!res.ok) {
        const err = getStringField(json, 'error')
        setImportError(err ?? 'Import failed. Please try again.')
        setLoading(false)
        return
      }

      const imported = getNumberField(json, 'imported') ?? 0
      const skipped = getNumberField(json, 'skipped') ?? 0
      setResultImported(imported)
      setResultSkipped(skipped)
      setStep('result')
      onImported(imported)
    } catch {
      setImportError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedPlatform = PLATFORMS.find((p) => p.id === platform)
  const preview = parsedRows.slice(0, 5)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Import clients from CSV
            </Dialog.Title>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Step: platform select ─────────────────────────────────────── */}
          {step === 'platform' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Select where you&apos;re importing from to get export instructions:
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {PLATFORMS.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={`border rounded-lg py-2 px-3 text-sm font-medium transition-colors
                      ${
                        platform === p.id
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {selectedPlatform && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <span className="font-medium">How to export: </span>
                  {selectedPlatform.hint}
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">
                  Drop CSV file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">Supports .csv files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {importError && (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {importError}
                </div>
              )}
            </div>
          )}

          {/* ── Step: upload / preview ────────────────────────────────────── */}
          {step === 'upload' && colMap && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">
                  {rowCount} row{rowCount !== 1 ? 's' : ''} found
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('platform')
                    fileInputRef.current?.click()
                  }}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Change file
                </button>
              </div>

              {noPhoneWarn && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm text-amber-800">
                  ⚠ No phone column detected. Clients will be imported without phone numbers (no
                  deduplication).
                </div>
              )}

              {/* Column mapping summary */}
              <div className="flex flex-wrap gap-2 mb-3">
                {(['name', 'phone', 'email', 'notes'] as const).map((field) => (
                  <span
                    key={field}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium
                      ${
                        colMap[field] >= 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                  >
                    {colMap[field] >= 0 ? '✓' : '—'} {field}
                    {colMap[field] >= 0 && (
                      <span className="opacity-60">← {headers[colMap[field]]}</span>
                    )}
                  </span>
                ))}
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2 text-gray-900 max-w-[150px] truncate">
                          {row.name || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">
                          {row.phone || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">
                          {row.email || <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rowCount > 5 && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
                    …and {rowCount - 5} more row{rowCount - 5 !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {importError && (
                <div className="mb-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {importError}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setStep('platform')}>
                  Back
                </Button>
                <Button size="sm" onClick={handleImport} disabled={loading || rowCount === 0}>
                  {loading ? 'Importing…' : `Import ${rowCount} client${rowCount !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: result ──────────────────────────────────────────────── */}
          {step === 'result' && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Import complete</h3>
              <p className="text-gray-600 mb-1">
                <span className="font-semibold text-green-700">{resultImported}</span> client
                {resultImported !== 1 ? 's' : ''} imported
              </p>
              {resultSkipped > 0 && (
                <p className="text-sm text-gray-400 mb-4">
                  {resultSkipped} skipped (duplicates or empty names)
                </p>
              )}
              <Button onClick={handleClose} className="mt-2">
                Done
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
