// Photos live in the browser's IndexedDB, which holds hundreds of megabytes,
// rather than in localStorage beside the rest of the data, which holds about
// five. A product keeps "idb:<id>" references to them. In production they
// would be files in Supabase Storage and the references plain URLs.

const DB = 'damark-shop-photos'
const STORE = 'photos'
const urls = new Map<string, Promise<string>>()

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = work(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function putPhoto(blob: Blob): Promise<string> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  try {
    await run('readwrite', (s) => s.put(blob, id))
    return 'idb:' + id
  } catch {
    // No IndexedDB (some private windows): keep the picture inline instead.
    return asDataUrl(blob)
  }
}

export function photoUrl(ref: string): Promise<string> {
  if (!ref.startsWith('idb:')) return Promise.resolve(ref)
  let url = urls.get(ref)
  if (!url) {
    url = run<Blob | undefined>('readonly', (s) => s.get(ref.slice(4))).then((blob) =>
      blob ? URL.createObjectURL(blob) : '',
    )
    urls.set(ref, url)
  }
  return url
}

export async function deletePhotos(refs: string[]) {
  for (const ref of refs) {
    if (!ref.startsWith('idb:')) continue
    urls.delete(ref)
    await run('readwrite', (s) => s.delete(ref.slice(4))).catch(() => {})
  }
}

export async function clearPhotos() {
  urls.clear()
  await run('readwrite', (s) => s.clear()).catch(() => {})
}
