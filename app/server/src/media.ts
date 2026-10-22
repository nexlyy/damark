import fs from 'node:fs/promises'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'
import type { DB } from './db.js'
import { paths } from './config.js'
import { fail, randomToken } from './util.js'

// Two cores and daon.pl next door: one image at a time, no pixel cache.
sharp.concurrency(1)
sharp.cache(false)

// Every photo is kept only as WebP in three widths; the upload itself is not
// stored. s fills catalog tiles (2x for ~200 px), m the product page on a
// phone, l the full-screen view.
export const SIZES = { s: 480, m: 960, l: 1600 } as const
export type Size = keyof typeof SIZES

export function mediaUrl(file: string, size: Size): string {
  return `/media/${file}-${size}.webp`
}

export function mediaUrls(file: string) {
  return { s: mediaUrl(file, 's'), m: mediaUrl(file, 'm'), l: mediaUrl(file, 'l') }
}

export type Stored = { file: string; width: number; height: number; bytes: number }

export async function storeImage(input: Buffer): Promise<Stored> {
  let meta: Metadata
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata()
  } catch {
    return fail(400, 'Не вдалося прочитати фото. Надішліть JPG, PNG або WebP.')
  }
  if (!meta.width || !meta.height) fail(400, 'Не вдалося прочитати фото.')
  if (meta.width! * meta.height! > 60_000_000) fail(400, 'Фото завелике.')

  const now = new Date()
  const dir = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const file = `${dir}/${randomToken(12)}`
  await fs.mkdir(path.join(paths.media, dir), { recursive: true })

  let width = 0
  let height = 0
  let bytes = 0
  // rotate() applies the phone's orientation; metadata (location, camera) is
  // not copied into the output.
  for (const [size, max] of Object.entries(SIZES) as Array<[Size, number]>) {
    const out = await sharp(input)
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: size === 's' ? 74 : 80, effort: 4 })
      .toFile(path.join(paths.media, `${file}-${size}.webp`))
    bytes += out.size
    if (size === 'l') {
      width = out.width
      height = out.height
    }
  }
  return { file, width, height, bytes }
}

export async function removeImageFiles(file: string) {
  await Promise.all(
    (Object.keys(SIZES) as Size[]).map((size) => fs.rm(path.join(paths.media, `${file}-${size}.webp`), { force: true })),
  )
}

export function insertMedia(db: DB, stored: Stored, owner: { productId?: number; reviewId?: number } = {}) {
  const info = db
    .prepare('INSERT INTO media (product_id, review_id, file, width, height, bytes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(owner.productId ?? null, owner.reviewId ?? null, stored.file, stored.width, stored.height, stored.bytes)
  return Number(info.lastInsertRowid)
}

// Uploads that never got attached to a product or review.
export async function removeOrphanMedia(db: DB) {
  const rows = db
    .prepare("SELECT id, file FROM media WHERE product_id IS NULL AND review_id IS NULL AND created_at < datetime('now', '-1 day')")
    .all() as Array<{ id: number; file: string }>
  for (const row of rows) {
    await removeImageFiles(row.file)
    db.prepare('DELETE FROM media WHERE id = ?').run(row.id)
  }
  return rows.length
}
