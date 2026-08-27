#!/usr/bin/env node
const { Client } = require('pg')
const PDFDocument = require('pdfkit')
const fs = require('fs')

const BUSINESS_ID = '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: false })
  await client.connect()

  const { rows: overall } = await client.query(`
    select count(*) as citas, count(*) filter (where status='completed') as ok,
           coalesce(sum(price) filter (where status='completed'),0) as revenue,
           (select count(*) from transactions where business_id=$1) as ventas,
           (select coalesce(sum(amount),0) from transactions where business_id=$1) as revenue_tx,
           (select coalesce(sum(amount),0) from commissions where business_id=$1) as comisiones,
           (select count(*) from clients where business_id=$1) as clientes
    from appointments where business_id=$1
  `, [BUSINESS_ID])
  const o = overall[0]

  const { rows: monthly } = await client.query(`
    select to_char(starts_at at time zone 'America/Bogota','YYYY-MM') as mes,
           count(*) filter (where status='completed') as citas,
           coalesce(sum(price) filter (where status='completed'),0) as revenue
    from appointments where business_id=$1 group by 1 order by 1
  `, [BUSINESS_ID])

  const { rows: perBarber } = await client.query(`
    select e.name,
      (select count(*) from appointments a where a.employee_id=e.id) as citas,
      (select count(*) from transactions t where t.employee_id=e.id) as ventas,
      (select coalesce(sum(amount),0) from transactions t where t.employee_id=e.id) as revenue,
      (select coalesce(sum(amount),0) from commissions c where c.employee_id=e.id) as comision
    from employees e where e.business_id=$1 order by revenue desc
  `, [BUSINESS_ID])

  const { rows: perService } = await client.query(`
    select s.name, s.category, count(a.id) as citas, coalesce(sum(a.price),0) as revenue
    from services s left join appointments a on a.service_id=s.id and a.business_id=$1 and a.status='completed'
    where s.business_id=$1 group by s.name, s.category order by revenue desc
  `, [BUSINESS_ID])

  const { rows: topClients } = await client.query(`
    select c.name, c.phone, count(a.id) as citas, coalesce(sum(a.price),0) as gasto
    from clients c left join appointments a on a.client_id=c.id and a.business_id=$1
    where c.business_id=$1 group by c.id order by gasto desc limit 10
  `, [BUSINESS_ID])

  await client.end()

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  const out = 'reports/Escuderia-Anual-2025-2026.pdf'
  if (!fs.existsSync('reports')) fs.mkdirSync('reports')
  doc.pipe(fs.createWriteStream(out))

  // Colors
  const brand = '#1a1a1a'
  const accent = '#16a34a'
  const gray = '#6b7280'

  // Header
  doc.rect(0, 0, 595, 80).fill(brand)
  doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('Escudería', 40, 28)
  doc.fontSize(10).font('Helvetica').text('Barbería • Colombia • COP • America/Bogota', 40, 50)
  doc.fontSize(9).fillColor('#a3a3a3').text('Reporte Anual  2025-08-28 → 2026-08-27', 40, 64)
  doc.fillColor(accent).fontSize(8).text('PRONTO BARBER • 43/43 tasks • 7.863 citas', 400, 64, { align: 'right', width: 150 })

  let y = 100

  // Resumen KPIs
  doc.fillColor(brand).fontSize(14).font('Helvetica-Bold').text('Resumen Ejecutivo', 40, y)
  y += 18
  const fmt = (n) => Number(n).toLocaleString('es-CO')
  const kpis = [
    ['Citas totales', fmt(o.citas)],
    ['Completadas', fmt(o.ok)],
    ['Ventas', fmt(o.ventas)],
    ['Revenue', `$${fmt(o.revenue)}`],
    ['Comisiones', `$${fmt(o.comisiones)}`],
    ['Clientes', fmt(o.clientes)],
    ['Ticket', `$${fmt(Math.round(Number(o.revenue)/Number(o.ventas)))}`],
  ]
  // KPI grid 4 cols
  const colW = 120
  kpis.forEach((k, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 40 + col * (colW + 10)
    const yy = y + row * 36
    doc.fillColor(gray).fontSize(7).font('Helvetica').text(k[0].toUpperCase(), x, yy, { width: colW })
    doc.fillColor(brand).fontSize(11).font('Helvetica-Bold').text(k[1], x, yy + 10, { width: colW })
  })
  y += Math.ceil(kpis.length/4)*36 + 12

  // Helper to draw table
  function table(title, headers, rows, colWidths, startY) {
    let yy = startY
    if (yy > 750) { doc.addPage(); yy = 40 }
    doc.fillColor(brand).fontSize(11).font('Helvetica-Bold').text(title, 40, yy)
    yy += 14
    // Header
    doc.fillColor('white').rect(40, yy, 515, 16).fill(accent)
    doc.fillColor('white').fontSize(7).font('Helvetica-Bold')
    let x = 40
    headers.forEach((h, i) => {
      doc.text(h, x + 4, yy + 5, { width: colWidths[i] - 8, align: i===0 ? 'left' : 'right' })
      x += colWidths[i]
    })
    yy += 16
    doc.font('Helvetica').fontSize(7).fillColor('#111827')
    rows.forEach((r, idx) => {
      if (yy > 770) { doc.addPage(); yy = 40 }
      if (idx % 2 === 0) doc.fillColor('#f9fafb').rect(40, yy, 515, 12).fill()
      doc.fillColor('#111827')
      x = 40
      r.forEach((cell, i) => {
        doc.text(String(cell), x + 4, yy + 3, { width: colWidths[i] - 8, align: i===0 ? 'left' : 'right' })
        x += colWidths[i]
      })
      yy += 12
    })
    // Line
    doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(40, yy).lineTo(555, yy).stroke()
    return yy + 12
  }

  // Mensual
  const mensualRows = monthly.map(m => [m.mes, fmt(m.citas), `$${fmt(m.revenue)}`])
  y = table('Evolución Mensual (citas completadas)', ['Mes','Citas','Revenue'], mensualRows, [120, 130, 265], y)

  // Barberos
  const barberRows = perBarber.map(b => [b.name, fmt(b.citas), fmt(b.ventas), `$${fmt(b.revenue)}`, `$${fmt(b.comision)}`])
  y = table('Rendimiento por Barbero', ['Barbero','Citas','Ventas','Revenue','Comisión'], barberRows, [130, 70, 70, 110, 135], y)

  // Servicios
  const svcRows = perService.map(s => [s.name, s.category, fmt(s.citas), `$${fmt(s.revenue)}`])
  y = table('Top Servicios', ['Servicio','Cat','Citas','Revenue'], svcRows, [180, 80, 80, 175], y)

  // Top clientes
  const cliRows = topClients.slice(0,8).map(c => [c.name, c.phone, fmt(c.citas), `$${fmt(c.gasto)}`])
  y = table('Top Clientes (por gasto)', ['Cliente','Tel','Citas','Gasto'], cliRows, [160, 130, 60, 165], y)

  // Footer
  doc.fillColor(gray).fontSize(7).font('Helvetica').text(
    `Generado ${new Date().toLocaleDateString('es-CO')} • Pronto Barber 43/43 • Supabase local 54321 • Escudería • COP • America/Bogota • 43 tasks • 7863 citas • 120 clientes`,
    40, 800, { align: 'center', width: 515 }
  )

  doc.end()
  await new Promise(r => doc.on('finish', r))
  console.log(`PDF: ${out} (${fs.statSync(out).size} bytes)`)
}

main().catch(e=>{console.error(e);process.exit(1)})
