import fs from 'node:fs/promises'
import path from 'node:path'
import type { DB } from './db.js'
import { paths } from './config.js'
import { removeOrphanMedia } from './media.js'
import { clearExpiredCache } from './novaposhta.js'
import { getOrder, overdueReservations, type OrderRow } from './orders.js'
import { applyTracking } from './routes/admin-orders.js'
import { getSettings } from './settings.js'
import { toTeam } from './telegram.js'

type Log = (msg: string) => void

// Background work, all in-process: one small shop, one Node process.
export function startJobs(db: DB, log: Log) {
  const every = (ms: number, name: string, job: () => Promise<unknown>) => {
    const run = () => job().catch((e: Error) => log(`${name}: ${e.message}`))
    setTimeout(run, 30_000).unref()
    setInterval(run, ms).unref()
  }

  // Unpaid reservations that ran out: tell the team once.
  every(5 * 60_000, 'reservations', async () => {
    for (const { id } of overdueReservations(db)) {
      const o = getOrder(db, id)
      db.prepare('UPDATE orders SET reserve_alerted = 1 WHERE id = ?').run(id)
      await toTeam(db, `⏰ Бронь №${o.number} закінчилась, оплати немає (${o.name.replace(/[<>&]/g, '')}, ${o.total} грн). Продовжити чи скасувати?`, id)
    }
  })

  // Parcels on their way, every two hours (Nova Poshta asks for no more).
  every(2 * 3600_000, 'tracking', async () => {
    if (!getSettings(db, 'novaPoshta').apiKey) return
    const orders = db
      .prepare("SELECT * FROM orders WHERE status IN ('shipped', 'arrived') AND ttn != '' AND (np_checked_at IS NULL OR np_checked_at < datetime('now', '-100 minutes'))")
      .all() as OrderRow[]
    const moved = await applyTracking(db, orders)
    if (moved) log(`tracking: ${moved} orders moved`)
  })

  every(6 * 3600_000, 'cleanup', async () => {
    clearExpiredCache(db)
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run()
    db.prepare("DELETE FROM trusted_devices WHERE expires_at < datetime('now')").run()
    db.prepare("DELETE FROM login_challenges WHERE expires_at < datetime('now')").run()
    const removed = await removeOrphanMedia(db)
    if (removed) log(`cleanup: ${removed} unused uploads removed`)
  })

  // Nightly backup at about 3:30, kept for 14 days.
  every(15 * 60_000, 'backup', async () => {
    const now = new Date()
    const local = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }))
    if (local.getHours() !== 3) return
    const stamp = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    const dir = path.join(paths.backups, stamp)
    if (await exists(path.join(dir, 'done'))) return
    await backup(db, dir)
    await prune(14)
    log(`backup: ${dir}`)
  })
}

const exists = (p: string) => fs.access(p).then(() => true, () => false)

// The database through SQLite's own online backup (consistent while the
// shop runs), and the photos as hard links: a link costs no space, and a
// photo deleted from the shop stays in the backup until the backup goes.
// Same disk, so this guards against mistakes, not against losing the
// server.
export async function backup(db: DB, dir: string) {
  await fs.mkdir(dir, { recursive: true })
  await db.backup(path.join(dir, 'damark.sqlite'))
  const mediaOut = path.join(dir, 'media')
  for (const sub of await fs.readdir(paths.media).catch(() => [] as string[])) {
    const from = path.join(paths.media, sub)
    if (!(await fs.stat(from)).isDirectory()) continue
    await fs.mkdir(path.join(mediaOut, sub), { recursive: true })
    for (const file of await fs.readdir(from)) {
      await fs.link(path.join(from, file), path.join(mediaOut, sub, file)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'EEXIST') throw e
      })
    }
  }
  await fs.writeFile(path.join(dir, 'done'), new Date().toISOString())
}

async function prune(keepDays: number) {
  const dirs = (await fs.readdir(paths.backups).catch(() => [] as string[])).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  for (const d of dirs.slice(0, Math.max(dirs.length - keepDays, 0))) await fs.rm(path.join(paths.backups, d), { recursive: true, force: true })
}
