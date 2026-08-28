export const MODULES = {
  bookings: {
    label: 'Bookings & Calendar',
    description: 'Appointments, schedule, staff assignments',
  },
  crm: {
    label: 'CRM & Clients',
    description: 'Client cards, visit history, tags and notes',
  },
  pos: {
    label: 'POS & Checkout',
    description: 'Sales, payments, receipts',
  },
  inventory: {
    label: 'Inventory',
    description: 'Stock, products, low-stock alerts',
  },
  notifications: {
    label: 'Notifications',
    description: 'Telegram, WhatsApp, Viber, Email reminders',
  },
} as const

export type ModuleKey = keyof typeof MODULES

export function isModuleEnabled(enabledModules: string[] | null | undefined, module: string): boolean {
  if (!Array.isArray(enabledModules) || typeof module !== 'string') return false
  return enabledModules.includes(module as ModuleKey)
}
