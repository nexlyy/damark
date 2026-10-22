import fs from 'node:fs'
import path from 'node:path'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { ZodError } from 'zod'
import { config, paths } from './config.js'
import type { DB } from './db.js'
import { sessionUser, type User } from './auth.js'
import { productBySlug } from './catalog.js'
import { seedPages } from './pages.js'
import { getSettings } from './settings.js'
import { HttpError } from './util.js'
import { publicRoutes } from './routes/public.js'
import { authRoutes } from './routes/auth.js'
import { adminCatalogRoutes } from './routes/admin-catalog.js'
import { adminOrderRoutes } from './routes/admin-orders.js'
import { adminOtherRoutes } from './routes/admin-other.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: User
  }
}

export type Ctx = { db: DB }

export async function buildApp(db: DB, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  seedPages(db)
  const app = Fastify({
    logger: opts.logger ? { level: 'info' } : false,
    // nginx in front sets X-Forwarded-For; rate limits need the real address.
    trustProxy: '127.0.0.1',
    bodyLimit: 1024 * 1024,
  })

  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5 } })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message })
    if (err instanceof ZodError) {
      const issue = err.issues[0]
      return reply.status(400).send({ error: issue?.message && !issue.message.startsWith('Invalid') ? issue.message : `Перевірте поле «${issue?.path.join('.')}».` })
    }
    const e = err as { statusCode?: number; code?: string; message: string }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'Файл завеликий (до 25 МБ).' })
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message })
    req.log.error(err)
    return reply.status(500).send({ error: 'Щось пішло не так. Спробуйте ще раз.' })
  })

  // Forms posted from other sites never reach the API: state changes must
  // come from this origin (browsers always send Origin on such requests).
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) return reply.status(403).send({ error: 'Чужий запит.' })
  })

  const ctx: Ctx = { db }
  await app.register(publicRoutes(ctx), { prefix: '/api' })
  await app.register(authRoutes(ctx), { prefix: '/api/auth' })
  await app.register(
    async (admin) => {
      admin.addHook('preHandler', async (req: FastifyRequest, reply) => {
        const user = sessionUser(db, req)
        if (!user) return reply.status(401).send({ error: 'Увійдіть в адмінку.' })
        req.user = user
      })
      await admin.register(adminCatalogRoutes(ctx))
      await admin.register(adminOrderRoutes(ctx))
      await admin.register(adminOtherRoutes(ctx))
    },
    { prefix: '/api/admin' },
  )

  app.all('/api/*', async (_req, reply) => reply.status(404).send({ error: 'Не знайдено.' }))

  if (config.serveStatic) {
    fs.mkdirSync(paths.media, { recursive: true })
    await app.register(fastifyStatic, { root: paths.media, prefix: '/media/', decorateReply: false, maxAge: '365d', immutable: true })
    if (fs.existsSync(path.join(config.webDir, 'assets'))) {
      await app.register(fastifyStatic, { root: path.join(config.webDir, 'assets'), prefix: '/assets/', decorateReply: false, maxAge: '365d', immutable: true })
    }
  }

  // Every other address is the single-page app. Product pages get their own
  // title and preview image so links shared in Telegram or Instagram look
  // right.
  let template: string | null = null
  const loadTemplate = () => {
    if (template === null || process.env.NODE_ENV !== 'production') {
      const file = path.join(config.webDir, 'index.html')
      template = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<!doctype html><html><head><title>DaMark</title></head><body><p>Run npm run build:web.</p></body></html>'
    }
    return template
  }
  app.get('/*', async (req, reply) => {
    const url = new URL(req.url, 'http://x')
    if (/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.endsWith('.html')) {
      const file = path.join(config.webDir, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''))
      if (config.serveStatic && file.startsWith(config.webDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return reply.type(contentType(file)).header('Cache-Control', 'public, max-age=3600').send(fs.createReadStream(file))
      }
      return reply.status(404).type('text/plain').send('Not found')
    }
    const shop = getSettings(db, 'shop')
    let title = shop.name
    let description = 'Одяг і білизна DaMark: каталог, розміри, наявність. Доставка Новою поштою 1–3 дні.'
    let image = `${config.publicUrl}/og.png`
    const product = /^\/p\/([a-z0-9-]+)\/?$/.exec(url.pathname)
    if (product) {
      const p = productBySlug(db, product[1], shop.sizes)
      if (p) {
        title = `${p.title} — ${p.price} грн · ${shop.name}`
        description = p.description.replace(/\s+/g, ' ').slice(0, 180) || description
        if (p.photos[0]) image = config.publicUrl + p.photos[0].m
      }
    }
    const html = loadTemplate()
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace('</head>', `<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(config.publicUrl + url.pathname)}">
</head>`)
    return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(html)
  })

  return app
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function contentType(file: string) {
  const ext = path.extname(file).toLowerCase()
  return (
    { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webp': 'image/webp' }[ext] ??
    'application/octet-stream'
  )
}
