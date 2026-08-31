'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, CheckCircle, Download, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

import { Button } from '@/components/ui/button'
import { isRecord } from '@/lib/validation/guard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  name: string
  sku: string
  barcode: string
  category: string
  unit: string
  quantity: string
  cost_price: string
  sell_price: string
  description: string
}

type Step = 'upload' | 'preview' | 'result'

interface Props {
  open: boolean
  onClose: () => void
  onImported: (count: number) => void
}

// ─── CSV delimiter detection ──────────────────────────────────────────────────

function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const semicolonCount = (firstLine.match(/;/g) ?? []).length
  return semicolonCount > commaCount ? ';' : ','
}

// ─── CSV parser (RFC 4180, no external libraries) ────────────────────────────

function handleInvInQuotes(
  ch: string,
  next: string | undefined,
  field: string,
): { field: string; advance: number; stay: boolean } | null {
  if (ch === '"' && next === '"') return { field: field + '"', advance: 2, stay: true }
  if (ch === '"') return { field, advance: 1, stay: false }
  return null
}

function handleInvDelimiter(
  ch: string,
  delimiter: string,
  field: string,
  row: string[],
): { row: string[]; field: string } | null {
  if (ch !== delimiter) return null
  return { row: [...row, field.trim()], field: '' }
}

function handleInvNewline(
  ch: string,
  next: string | undefined,
  field: string,
  row: string[],
  rows: string[][],
): { row: string[]; field: string; rows: string[][]; advance: number } | null {
  if (ch === '\r' && next === '\n') {
    const nr = [...row, field.trim()]
    return { row: [], field: '', rows: nr.some((c) => c !== '') ? [...rows, nr] : rows, advance: 2 }
  }
  if (ch === '\n' || ch === '\r') {
    const nr = [...row, field.trim()]
    return { row: [], field: '', rows: nr.some((c) => c !== '') ? [...rows, nr] : rows, advance: 1 }
  }
  return null
}

function pushInvLastRow(field: string, row: string[], rows: string[][]): string[][] {
  if (field.length === 0 && row.length === 0) return rows
  const nr = [...row, field.trim()]
  if (!nr.some((c) => c !== '')) return rows
  return [...rows, nr]
}

function parseCSV(text: string, delimiter = ','): string[][] {
  let rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i] as string
    const next = text[i + 1]

    if (inQuotes) {
      const res = handleInvInQuotes(ch, next, field)
      if (res) {
        field = res.field
        inQuotes = res.stay
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

    const delim = handleInvDelimiter(ch, delimiter, field, row)
    if (delim) {
      row = delim.row
      field = delim.field
      i++
      continue
    }

    const nl = handleInvNewline(ch, next, field, row, rows)
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

  return pushInvLastRow(field, row, rows)
}

// ─── File parser — CSV + XLSX/XLS ─────────────────────────────────────────────

function isXlsxWorkbook(
  value: unknown,
): value is { SheetNames: string[]; Sheets: Record<string, unknown> } {
  if (!isRecord(value)) return false
  const names = value['SheetNames']
  const sheets = value['Sheets']
  return Array.isArray(names) && isRecord(sheets)
}

function sheetToRowsSafe(worksheet: unknown): string[][] {
  // Isolate external-library `any` into a typed wrapper with explicit unknown guard
  if (worksheet == null || typeof worksheet !== 'object') return []
  // XLSX.utils.sheet_to_json expects WorkSheet; we narrow via branded unknown
  const ws = worksheet as XLSX.WorkSheet
  const rows: unknown = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
  if (!Array.isArray(rows)) return []
  return rows as string[][]
}

async function parseFile(file: File): Promise<string[][]> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const wbUnknown: unknown = XLSX.read(buffer, { type: 'array' })
    if (!isXlsxWorkbook(wbUnknown)) return []
    const firstName: unknown = wbUnknown.SheetNames[0]
    if (typeof firstName !== 'string') return []
    const ws: unknown = wbUnknown.Sheets[firstName]
    return sheetToRowsSafe(ws)
  }

  // CSV
  const text = await file.text()
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const delimiter = detectDelimiter(firstLine)
  return parseCSV(text, delimiter)
}

// ─── Column detection ─────────────────────────────────────────────────────────

const COLUMN_KEYWORDS: Record<keyof ParsedRow, string[]> = {
  name: ['name', 'product', 'item'],
  sku: ['sku', 'code'],
  barcode: ['barcode', 'ean', 'upc'],
  category: ['category', 'group'],
  unit: ['unit', 'uom'],
  quantity: ['quantity', 'qty', 'stock'],
  cost_price: ['cost price', 'cost_price', 'cost'],
  sell_price: ['sell price', 'sell_price', 'selling price', 'retail price', 'sale price'],
  description: ['description', 'notes'],
}

function detectColumns(headers: string[]): Record<keyof ParsedRow, number> {
  const normalized = headers.map((h) => String(h).toLowerCase().trim())
  const result = {} as Record<keyof ParsedRow, number>
  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    let found = -1
    for (const kw of keywords) {
      const idx = normalized.indexOf(kw.toLowerCase())
      if (idx !== -1) {
        found = idx
        break
      }
    }
    if (found === -1) {
      for (const kw of keywords) {
        const idx = normalized.findIndex((h) => h.includes(kw.toLowerCase()))
        if (idx !== -1) {
          found = idx
          break
        }
      }
    }
    result[field as keyof ParsedRow] = found
  }
  return result
}

function rowsToParsed(rows: string[][], colMap: Record<keyof ParsedRow, number>): ParsedRow[] {
  return rows.map((row) => {
    const get = (field: keyof ParsedRow) =>
      colMap[field] >= 0 ? String(row[colMap[field]] ?? '') : ''
    return {
      name: get('name'),
      sku: get('sku'),
      barcode: get('barcode'),
      category: get('category'),
      unit: get('unit'),
      quantity: get('quantity'),
      cost_price: get('cost_price'),
      sell_price: get('sell_price'),
      description: get('description'),
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportInventoryModal({ open, onClose, onImported }: Props): React.JSX.Element {
  const t = useTranslations('inventory')

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState<boolean>(false)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [colMap, setColMap] = useState<Record<keyof ParsedRow, number> | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rowCount, setRowCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [resultImported, setResultImported] = useState<number>(0)
  const [resultSkipped, setResultSkipped] = useState<number>(0)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose(): void {
    setStep('upload')
    setParsedRows([])
    setColMap(null)
    setHeaders([])
    setRowCount(0)
    setLoading(false)
    setImportError(null)
    onClose()
  }

  function downloadTemplate(): void {
    const tmplHeaders = [
      [
        'Name',
        'SKU',
        'Barcode',
        'Category',
        'Unit',
        'Quantity',
        'Cost price',
        'Sell price',
        'Description',
      ],
    ]
    const ws = XLSX.utils.aoa_to_sheet(tmplHeaders)
    // `!cols` is a library-specific extension property; assign via unknown-safe cast
    const colsValue: unknown = [
      { wch: 30 },
      { wch: 15 },
      { wch: 18 },
      { wch: 20 },
      { wch: 8 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
    ]
    ;(ws as Record<string, unknown>)['!cols'] = colsValue
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'pronto-products-template.xlsx')
  }

  const processFile = useCallback(async (file: File): Promise<void> => {
    setImportError(null)
    try {
      const matrix: string[][] = await parseFile(file)
      if (matrix.length < 2) {
        setImportError('File appears empty or could not be parsed.')
        return
      }
      const rawHdrs: string[] = matrix[0] ?? []
      const hdrs: string[] = rawHdrs.map((c) => String(c))
      const dataRows: string[][] = matrix.slice(1).map((r) => r.map((c) => String(c)))
      const map: Record<keyof ParsedRow, number> = detectColumns(hdrs)

      if (map.name === -1) {
        setImportError('No "name" column found. Please check your file headers.')
        return
      }

      setHeaders(hdrs)
      setColMap(map)
      setRowCount(dataRows.length)
      setParsedRows(rowsToParsed(dataRows, map))
      setStep('preview')
    } catch {
      setImportError('Failed to read file.')
    }
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const file: File | undefined = e.target.files?.[0]
    if (file) void processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragging(false)
    const file: File | undefined = e.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

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

  async function handleImport(): Promise<void> {
    setLoading(true)
    setImportError(null)
    try {
      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
      })
      const json: unknown = await res.json()

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

  const preview = parsedRows.slice(0, 5)
  const PREVIEW_FIELDS: (keyof ParsedRow)[] = ['name', 'sku', 'quantity', 'sell_price']

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
              Import Products
            </Dialog.Title>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Step: upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">{t('import.uploadHint')}</p>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <Upload className="w-9 h-9 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">{t('import.dropzone')}</p>
                <p className="text-xs text-gray-400 mt-1.5">{t('import.dropzoneFormats')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
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

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">{t('import.orSeparator')}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <p className="text-xs font-medium text-gray-500 mb-2">{t('import.templateHint')}</p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-2 w-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4 shrink-0 text-gray-400" />
                {t('import.downloadTemplate')}
              </button>
              <p className="text-xs text-gray-400 mt-1.5">{t('import.templateSubhint')}</p>
            </div>
          )}

          {/* ── Step: preview ────────────────────────────────────────────── */}
          {step === 'preview' && colMap && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">
                  {t('import.productsFound', { count: rowCount })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('upload')
                    setImportError(null)
                  }}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Change file
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {(Object.keys(COLUMN_KEYWORDS) as (keyof ParsedRow)[]).map((field) => (
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

              <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {PREVIEW_FIELDS.map((f) => (
                        <th
                          key={f}
                          className="px-3 py-2 text-left font-medium text-gray-500 capitalize"
                        >
                          {f.replace('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        {PREVIEW_FIELDS.map((f) => (
                          <td key={f} className="px-3 py-2 text-gray-900 max-w-[120px] truncate">
                            {row[f] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
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
                <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                  Back
                </Button>
                <Button size="sm" onClick={handleImport} disabled={loading || rowCount === 0}>
                  {loading ? t('import.importing') : t('import.importN', { count: rowCount })}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: result ──────────────────────────────────────────────── */}
          {step === 'result' && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('import.result')}</h3>
              <p className="text-gray-600 mb-1">
                <span className="font-semibold text-green-700">{resultImported}</span>{' '}
                {t('import.imported', { count: resultImported })}
              </p>
              {resultSkipped > 0 && (
                <p className="text-sm text-gray-400 mb-4">
                  {t('import.skipped', { count: resultSkipped })}
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
