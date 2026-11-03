import { describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import { classifyUploadFile, MAX_ORIGINAL_IMAGE_BYTES, prepareImage, validateImageFile, validateImageSignature } from './imagePreparation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image upload preparation', () => {
  it('routes JPEG and PNG through OCR and PDF through the existing path', () => {
    expect(classifyUploadFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('jpeg')
    expect(classifyUploadFile({ name: 'photo.png', type: 'image/png' })).toBe('png')
    expect(classifyUploadFile({ name: 'document.pdf', type: 'application/pdf' })).toBe('pdf')
  })

  it('rejects WebP and HEIC for Milestone 1', () => {
    expect(classifyUploadFile({ name: 'photo.webp', type: 'image/webp' })).toBe('unsupported')
    expect(classifyUploadFile({ name: 'photo.heic', type: 'image/heic' })).toBe('unsupported')
  })

  it('rejects MIME or extension mismatch', async () => {
    const mismatch = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.png', { type: 'image/png' })
    expect(validateImageFile(mismatch)).toBeUndefined()
    await expect(validateImageSignature(mismatch)).rejects.toBeTruthy()
  })

  it('rejects original images over 15 MB', () => {
    const oversized = new File([new Uint8Array(MAX_ORIGINAL_IMAGE_BYTES + 1)], 'photo.jpg', { type: 'image/jpeg' })
    expect(() => validateImageFile(oversized)).toThrow(/15 MB/)
  })

  it('closes ImageBitmap and resets canvas on successful preparation', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 3000, height: 2000, close,
    }))
    const canvas = {
      width: 3000,
      height: 2000,
      getContext: vi.fn().mockReturnValue({
        fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(),
      }),
      toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })),
    }
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0])], 'photo.jpg', { type: 'image/jpeg' })

    await prepareImage(file)
    expect(close).toHaveBeenCalled()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('closes ImageBitmap and resets canvas when context creation fails', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 3000, height: 2000, close,
    }))
    const canvas = {
      width: 3000,
      height: 2000,
      getContext: vi.fn().mockReturnValue(null),
      toBlob: vi.fn(),
    }
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0])], 'photo.jpg', { type: 'image/jpeg' })

    await expect(prepareImage(file)).rejects.toBeTruthy()
    expect(close).toHaveBeenCalled()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('always revokes the temporary object URL on HTML image fallback', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test-image'),
      revokeObjectURL,
    })
    class MockImage {
      naturalWidth = 100
      naturalHeight = 100
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('HTMLImageElement', MockImage)
    vi.stubGlobal('Image', MockImage)
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue({
        fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(),
      }),
      toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })),
    }
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0])], 'photo.jpg', { type: 'image/jpeg' })

    await prepareImage(file)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-image')
  })
})
