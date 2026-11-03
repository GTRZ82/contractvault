export const MAX_ORIGINAL_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_PREPARED_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_LONGEST_SIDE = 2800

export type PreparedImage = {
  blob: Blob
  width: number
  height: number
}

export class ImagePreparationError extends Error {
  readonly code: 'UNSUPPORTED_FILE' | 'IMAGE_TOO_LARGE' | 'IMAGE_INVALID' | 'IMAGE_PREPARATION_FAILED'
  constructor(code: 'UNSUPPORTED_FILE' | 'IMAGE_TOO_LARGE' | 'IMAGE_INVALID' | 'IMAGE_PREPARATION_FAILED', message: string) {
    super(message)
    this.name = 'ImagePreparationError'
    this.code = code
  }
}

export function classifyUploadFile(file: Pick<File, 'name' | 'type'>): 'pdf' | 'jpeg' | 'png' | 'unsupported' {
  const lowerName = file.name.toLowerCase()
  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'
  if (file.type === 'image/jpeg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'jpeg'
  if (file.type === 'image/png' || lowerName.endsWith('.png')) return 'png'
  return 'unsupported'
}

export function validateImageFile(file: File) {
  const name = file.name.toLowerCase()
  const extension = name.split('.').pop()
  const supportedMime = file.type === 'image/jpeg' || file.type === 'image/png'
  const supportedExtension = extension === 'jpg' || extension === 'jpeg' || extension === 'png'

  if (!supportedMime || !supportedExtension) {
    throw new ImagePreparationError('UNSUPPORTED_FILE', 'Unsupported file type. Please select a JPEG or PNG image.')
  }
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
    throw new ImagePreparationError('IMAGE_TOO_LARGE', 'Image is too large. The maximum original size is 15 MB.')
  }
}

async function readMagicBytes(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  return { jpeg, png }
}

export async function validateImageSignature(file: File) {
  const { jpeg, png } = await readMagicBytes(file)
  const name = file.name.toLowerCase()
  const isJpegName = name.endsWith('.jpg') || name.endsWith('.jpeg')
  const isPngName = name.endsWith('.png')
  const mimeMatchesJpeg = file.type === 'image/jpeg' && jpeg && isJpegName
  const mimeMatchesPng = file.type === 'image/png' && png && isPngName
  if (!mimeMatchesJpeg && !mimeMatchesPng) {
    throw new ImagePreparationError('UNSUPPORTED_FILE', 'The file type and contents do not match a supported JPEG or PNG image.')
  }
}

async function decodeWithCreateImageBitmap(file: File): Promise<{ source: ImageBitmap; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return { source: bitmap, width: bitmap.width, height: bitmap.height }
}

async function decodeWithHtmlImage(file: File): Promise<{ source: HTMLImageElement; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new ImagePreparationError('IMAGE_INVALID', 'Could not read the selected image.'))
      image.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new ImagePreparationError('IMAGE_PREPARATION_FAILED', 'Could not prepare the image.'))
    }, 'image/jpeg', 0.85)
  })
}

async function prepareAtLongestSide(file: File, longestSide: number): Promise<PreparedImage> {
  let decoded: { source: ImageBitmap | HTMLImageElement; width: number; height: number } | null = null
  let canvas: HTMLCanvasElement | null = null
  try {
    if (typeof createImageBitmap === 'function') decoded = await decodeWithCreateImageBitmap(file)
    if (!decoded) throw new Error('Image decode failed')
  } catch {
    decoded = await decodeWithHtmlImage(file)
  }

  try {
    if (!decoded.width || !decoded.height) {
      throw new ImagePreparationError('IMAGE_INVALID', 'The selected image has invalid dimensions.')
    }
    const scale = Math.min(1, longestSide / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new ImagePreparationError('IMAGE_PREPARATION_FAILED', 'Image preparation is not supported by this browser.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await canvasToBlob(canvas)
    return { blob, width, height }
  } finally {
    if (decoded && 'close' in decoded.source && typeof decoded.source.close === 'function') decoded.source.close()
    if (typeof HTMLImageElement !== 'undefined' && decoded.source instanceof HTMLImageElement) decoded.source.src = ''
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  validateImageFile(file)
  await validateImageSignature(file)

  let prepared = await prepareAtLongestSide(file, MAX_LONGEST_SIDE)
  if (prepared.blob.size > MAX_PREPARED_IMAGE_BYTES) {
    prepared = await prepareAtLongestSide(file, 2200)
  }
  if (prepared.blob.size > MAX_PREPARED_IMAGE_BYTES) {
    throw new ImagePreparationError('IMAGE_TOO_LARGE', 'The prepared image remains above 4 MB.')
  }
  return prepared
}
