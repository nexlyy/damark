// Phone photos are 3–12 MB. Shrinking them on the phone before upload saves
// the buyer's or Anna's mobile data and the server's two cores, and turns
// iPhone HEIC into JPEG the server can read. If the browser cannot decode
// the file, it goes up as it is and the server decides.

const MAX_SIDE = 2400

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void } | null> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      /* try the <img> route */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

export async function prepareImage(file: File): Promise<Blob> {
  const img = await decode(file)
  if (!img) return file
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 2_500_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    return blob ?? file
  } finally {
    img.close()
  }
}

export async function uploadImage(url: string, file: File) {
  const blob = await prepareImage(file)
  const form = new FormData()
  form.append('file', blob, file.name.replace(/\.\w+$/, '') + '.jpg')
  const { api } = await import('./api')
  return api.post<{ id: number; s: string; m: string; l: string; width: number; height: number }>(url, form)
}
