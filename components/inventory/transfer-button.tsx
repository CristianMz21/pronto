'use client'
import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { TransferModal } from './transfer-modal'

export function TransferButton({
  items,
  locations,
}: {
  items: { id: string; name: string; quantity: number }[]
  locations: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  if (locations.length < 1) return null
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowRightLeft className="w-4 h-4 mr-1" /> Transferir
      </Button>
      {open && <TransferModal items={items} locations={locations} onClose={() => setOpen(false)} />}
    </>
  )
}
