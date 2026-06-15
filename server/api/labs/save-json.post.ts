export default defineEventHandler(async (event) => {
  const authCookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET
  if (!secret || !authCookie || authCookie !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const uploadPin = getCookie(event, 'labs-upload-auth')
  const correctPin = process.env.LABS_UPLOAD_PIN
  if (!correctPin || !uploadPin || uploadPin !== correctPin) {
    throw createError({ statusCode: 403, message: 'Upload PIN required' })
  }

  if (!import.meta.dev) {
    throw createError({ statusCode: 403, message: 'File saving is only available in development mode. Download the JSON and add it to content/labs/ manually.' })
  }

  const body = await readBody<{ date: string, _type?: string }>(event)
  if (!body?.date) {
    throw createError({ statusCode: 400, message: 'Missing date field' })
  }

  const [{ writeFile, mkdir }, { join }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path')
  ])

  const folder = body._type === 'dexa' ? 'dexa' : 'labs'
  const { _type: _, ...data } = body
  const filename = `${data.date}.json`
  const dir = join(process.cwd(), 'content', folder)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), JSON.stringify(data, null, 2))

  return { ok: true, file: `content/${folder}/${filename}` }
})
