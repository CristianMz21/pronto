'use client'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ReportExportButton({
  data,
  filename,
}: {
  data: Record<string, unknown>[]
  filename: string
}) {
  async function handleExport() {
    if (!data || data.length === 0) {
      alert('Sin datos para exportar')
      return
    }
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
    XLSX.writeFile(wb, filename)
  }
  return (
    <Button size="sm" variant="outline" onClick={handleExport}>
      <Download className="w-4 h-4 mr-1" /> Exportar XLSX
    </Button>
  )
}
