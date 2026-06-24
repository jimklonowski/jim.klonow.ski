export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const secret = process.env.LABS_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  if (!import.meta.dev) {
    throw createError({ statusCode: 403, message: 'File saving is only available in development mode.' })
  }

  const body = await readBody(event)
  const metrics: Array<{ name: string; units?: string; data: Array<Record<string, unknown>> }> =
    body?.data?.metrics ?? []

  const byDate: Record<string, {
    weight_lbs?: number
    rhr?: number
    hrv?: number
    bp_systolic?: number
    bp_diastolic?: number
  }> = {}

  for (const metric of metrics) {
    const { name, units, data } = metric
    for (const point of data ?? []) {
      const dateStr = String(point.date ?? '').substring(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      if (!byDate[dateStr]) byDate[dateStr] = {}

      const qty = typeof point.qty === 'number' ? point.qty
        : typeof point.value === 'number' ? point.value : null

      if (name === 'body_mass' && qty != null) {
        byDate[dateStr].weight_lbs = units === 'kg'
          ? Math.round(qty * 2.20462 * 10) / 10
          : Math.round(qty * 10) / 10
      }
      else if (name === 'resting_heart_rate' && qty != null) {
        byDate[dateStr].rhr = Math.round(qty)
      }
      else if (name === 'heart_rate_variability' && qty != null) {
        byDate[dateStr].hrv = Math.round(qty)
      }
      else if (name === 'blood_pressure') {
        if (typeof point.systolic === 'number') byDate[dateStr].bp_systolic = Math.round(point.systolic)
        if (typeof point.diastolic === 'number') byDate[dateStr].bp_diastolic = Math.round(point.diastolic)
      }
      else if (name === 'blood_pressure_systolic' && qty != null) {
        byDate[dateStr].bp_systolic = Math.round(qty)
      }
      else if (name === 'blood_pressure_diastolic' && qty != null) {
        byDate[dateStr].bp_diastolic = Math.round(qty)
      }
    }
  }

  const [{ readFile, writeFile, mkdir }, { join }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path')
  ])

  const dir = join(process.cwd(), 'content', 'journal')
  await mkdir(dir, { recursive: true })

  const updated: string[] = []
  const created: string[] = []

  for (const [date, vitals] of Object.entries(byDate)) {
    const filePath = join(dir, `${date}.json`)
    let entry: Record<string, unknown>
    let existed = false

    try {
      entry = JSON.parse(await readFile(filePath, 'utf-8'))
      existed = true
    }
    catch {
      entry = { date, peptides: [], reconstitutions: [], food: {}, workout: '', notes: '' }
    }

    let changed = false
    for (const [field, value] of Object.entries(vitals)) {
      if (entry[field] == null && value != null) {
        entry[field] = value
        changed = true
      }
    }

    if (changed) {
      await writeFile(filePath, JSON.stringify(entry, null, 2))
      existed ? updated.push(date) : created.push(date)
    }
  }

  return { ok: true, created: created.length, updated: updated.length, dates: [...created, ...updated].sort() }
})
