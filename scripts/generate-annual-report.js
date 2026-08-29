#!/usr/bin/env node
const fs = require('fs')

const { Client } = require('pg')
const XLSX = require('xlsx')

const BUSINESS_ID = '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: false })
  await client.connect()
  console.log('Generating annual report for Escudería...')

  // Monthly
  const { rows: monthly } = await client.query(
    `
    select to_char(starts_at at time zone 'America/Bogota','YYYY-MM') as mes,
           count(*) filter (where status='completed') as citas_ok,
           count(*) filter (where status='cancelled') as cancel,
           count(*) filter (where status='no_show') as noshow,
           count(*) as total_citas,
           coalesce(sum(price) filter (where status='completed'),0) as revenue_citas
    from appointments where business_id=$1 group by 1 order by 1
  `,
    [BUSINESS_ID],
  )
  const { rows: monthlyTx } = await client.query(
    `
    select to_char(created_at at time zone 'America/Bogota','YYYY-MM') as mes,
           count(*) as ventas, sum(amount) as revenue, 
           count(*) filter (where payment_method='cash') as cash, 
           count(*) filter (where payment_method='card') as card,
           count(*) filter (where payment_method='transfer') as transf
    from transactions where business_id=$1 group by 1 order by 1
  `,
    [BUSINESS_ID],
  )

  // Per barber
  const { rows: perBarber } = await client.query(
    `
    select e.name,
      (select count(*) from appointments a where a.employee_id=e.id) as citas,
      (select count(*) from transactions t where t.employee_id=e.id) as ventas,
      (select coalesce(sum(amount),0) from transactions t where t.employee_id=e.id) as revenue,
      (select coalesce(sum(amount),0) from commissions c where c.employee_id=e.id) as comision,
      (select count(*) from appointments a where a.employee_id=e.id and a.status='cancelled') as cancel,
      (select count(*) from appointments a where a.employee_id=e.id and a.status='no_show') as noshow
    from employees e where e.business_id=$1 order by revenue desc
  `,
    [BUSINESS_ID],
  )

  // Per service
  const { rows: perService } = await client.query(
    `
    select s.name, s.category, count(a.id) as citas, coalesce(sum(a.price),0) as revenue, avg(a.price) as ticket
    from services s left join appointments a on a.service_id=s.id and a.business_id=$1 and a.status='completed'
    where s.business_id=$1 group by s.name, s.category order by revenue desc
  `,
    [BUSINESS_ID],
  )

  // Top clients
  const { rows: topClients } = await client.query(
    `
    select c.name, c.phone, c.tags, count(a.id) as citas, coalesce(sum(a.price),0) as gasto, max(a.starts_at at time zone 'America/Bogota')::date as ultima
    from clients c left join appointments a on a.client_id=c.id and a.business_id=$1
    where c.business_id=$1 group by c.id order by gasto desc limit 15
  `,
    [BUSINESS_ID],
  )

  // Overall
  const { rows: overall } = await client.query(
    `
    select count(*) as citas, count(*) filter (where status='completed') as ok, count(*) filter (where status='cancelled') as cancel, count(*) filter (where status='no_show') as noshow,
           coalesce(sum(price) filter (where status='completed'),0) as revenue_citas,
           (select count(*) from transactions where business_id=$1) as ventas,
           (select coalesce(sum(amount),0) from transactions where business_id=$1) as revenue,
           (select coalesce(sum(amount),0) from commissions where business_id=$1) as comisiones,
           (select count(*) from clients where business_id=$1) as clientes
    from appointments where business_id=$1
  `,
    [BUSINESS_ID],
  )

  console.log('Overall:', overall[0])
  console.log('Monthly:', monthly.length, 'months')

  // Build workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Resumen
  const resumen = [
    ['Escudería — Reporte Anual', '2025-08-28 → 2026-08-27'],
    [],
    ['Métrica', 'Valor'],
    ['Citas totales', overall[0].citas],
    ['Completadas', overall[0].ok],
    ['Canceladas', overall[0].cancel],
    ['No-show', overall[0].noshow],
    ['Ventas', overall[0].ventas],
    ['Revenue citas', Number(overall[0].revenue_citas)],
    ['Revenue ventas', Number(overall[0].revenue)],
    ['Comisiones', Number(overall[0].comisiones)],
    ['Clientes', overall[0].clientes],
    ['Ticket promedio', (Number(overall[0].revenue) / Number(overall[0].ventas)).toFixed(0)],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')

  // Sheet 2: Mensual
  const mensualHeader = [
    'Mes',
    'Citas',
    'Completadas',
    'Cancel',
    'No-show',
    'Revenue citas',
    'Ventas',
    'Revenue',
    'Cash',
    'Card',
    'Transfer',
  ]
  const mensualData = monthly.map((m) => {
    const tx = monthlyTx.find((x) => x.mes === m.mes) || {}
    return [
      m.mes,
      Number(m.total_citas),
      Number(m.citas_ok),
      Number(m.cancel),
      Number(m.noshow),
      Number(m.revenue_citas),
      Number(tx.ventas || 0),
      Number(tx.revenue || 0),
      Number(tx.cash || 0),
      Number(tx.card || 0),
      Number(tx.transf || 0),
    ]
  })
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([mensualHeader, ...mensualData]),
    'Mensual',
  )

  // Sheet 3: Barberos
  const barberHeader = [
    'Barbero',
    'Citas',
    'Ventas',
    'Revenue',
    'Comisión',
    'Cancel',
    'No-show',
    'Comisión %',
  ]
  const barberData = perBarber.map((b) => [
    b.name,
    Number(b.citas),
    Number(b.ventas),
    Number(b.revenue),
    Number(b.comision),
    Number(b.cancel),
    Number(b.noshow),
    b.revenue > 0 ? ((Number(b.comision) / Number(b.revenue)) * 100).toFixed(1) + '%' : '0%',
  ])
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([barberHeader, ...barberData]),
    'Barberos',
  )

  // Sheet 4: Servicios
  const svcHeader = ['Servicio', 'Categoría', 'Citas', 'Revenue', 'Ticket']
  const svcData = perService.map((s) => [
    s.name,
    s.category,
    Number(s.citas),
    Number(s.revenue),
    Number(s.ticket || 0).toFixed(0),
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([svcHeader, ...svcData]), 'Servicios')

  // Sheet 5: Top clientes
  const cliHeader = ['Cliente', 'Tel', 'Tags', 'Citas', 'Gasto', 'Última']
  const cliData = topClients.map((c) => [
    c.name,
    c.phone,
    (c.tags || []).join(', '),
    Number(c.citas),
    Number(c.gasto),
    c.ultima ? new Date(c.ultima).toISOString().slice(0, 10) : '',
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cliHeader, ...cliData]), 'TopClientes')

  const out = 'reports/Escuderia-Anual-2025-2026.xlsx'
  if (!fs.existsSync('reports')) fs.mkdirSync('reports')
  XLSX.writeFile(wb, out)
  console.log(`Excel: ${out} (${fs.statSync(out).size} bytes)`)

  // Also write markdown report
  const md = `# Escudería — Reporte Anual 2025-08-28 → 2026-08-27

**Resumen:** ${overall[0].citas} citas (${overall[0].ok} completadas), ${overall[0].ventas} ventas, $${Number(overall[0].revenue).toLocaleString('es-CO')} revenue, $${Number(overall[0].comisiones).toLocaleString('es-CO')} comisiones, ${overall[0].clientes} clientes, ticket $${(Number(overall[0].revenue) / Number(overall[0].ventas)).toFixed(0)}

## Mensual
| Mes | Citas | Revenue |
|-----|-------|---------|
${monthly.map((m) => `| ${m.mes} | ${m.citas_ok}/${m.total_citas} | $${Number(m.revenue_citas).toLocaleString('es-CO')} |`).join('\n')}

## Por Barbero
| Barbero | Citas | Ventas | Revenue | Comisión |
|---------|-------|--------|---------|----------|
${perBarber.map((b) => `| ${b.name} | ${b.citas} | ${b.ventas} | $${Number(b.revenue).toLocaleString('es-CO')} | $${Number(b.comision).toLocaleString('es-CO')} |`).join('\n')}

## Top Servicios
| Servicio | Citas | Revenue |
|----------|-------|---------|
${perService.map((s) => `| ${s.name} | ${s.citas} | $${Number(s.revenue).toLocaleString('es-CO')} |`).join('\n')}

## Top Clientes
| Cliente | Citas | Gasto |
|---------|-------|-------|
${topClients
  .slice(0, 5)
  .map((c) => `| ${c.name} | ${c.citas} | $${Number(c.gasto).toLocaleString('es-CO')} |`)
  .join('\n')}
`
  fs.writeFileSync('reports/Escuderia-Anual-2025-2026.md', md)
  console.log('Markdown: reports/Escuderia-Anual-2025-2026.md')

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
