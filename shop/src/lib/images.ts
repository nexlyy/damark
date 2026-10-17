import { putPhoto } from './photos'

// Photos from a phone are several megabytes. Before they are kept they are
// scaled to 1200px on the long side and saved as JPEG, which is what a product
// page needs.

const LONG_SIDE = 1200

export async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Не вдалося прочитати фото'))
      el.src = url
    })
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не вдалося стиснути фото'))), 'image/jpeg', 0.8),
    )
    return putPhoto(blob)
  } finally {
    URL.revokeObjectURL(url)
  }
}
