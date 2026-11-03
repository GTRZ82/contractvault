import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}))

import { OCR_FRONTEND_TIMEOUT_MS, runOcrImage } from './ocrRead'

describe('OCR frontend request', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('aborts after the configured timeout and maps AbortError to OCR_TIMEOUT', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const request = runOcrImage(new Blob(['image']), 'photo.jpg')
    const expectation = expect(request).rejects.toThrow('OCR_TIMEOUT')
    await vi.advanceTimersByTimeAsync(OCR_FRONTEND_TIMEOUT_MS)
    await expectation
  })

  it('clears the timeout after success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Invoice' }), { status: 200 })))
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    await runOcrImage(new Blob(['image']), 'photo.jpg')
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('clears the timeout after failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'OCR_PROVIDER_ERROR' }), { status: 502 })))
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    await expect(runOcrImage(new Blob(['image']), 'photo.jpg')).rejects.toThrow('OCR_PROVIDER_ERROR')
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('uses binary POST body and replacement abort signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'text' }), { status: 200 })))
    const replacement = new AbortController()
    const prepared = new Blob(['image'])
    await runOcrImage(prepared, 'photo.jpg', replacement.signal)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(prepared)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).not.toHaveProperty('Content-Length')
  })

  it('maps an active image replacement abort to OCR_TIMEOUT safely', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const replacement = new AbortController()
    const request = runOcrImage(new Blob(['image']), 'old.jpg', replacement.signal)
    const expectation = expect(request).rejects.toThrow('OCR_TIMEOUT')
    replacement.abort()
    await expectation
  })
})
