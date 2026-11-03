import { describe, expect, it, vi } from 'vitest'
import {
  OCR_MAX_BODY_BYTES,
  encodeBytesAsBase64,
  getCorsHeaders,
  pollAzureRead,
  submitAzureRead,
  validateImage,
  validateOperationLocation,
  validateRequest,
} from './_shared'

describe('OCR Edge Function validation', () => {
  it('rejects binary requests over 4.5 MB', () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'content-length': String(OCR_MAX_BODY_BYTES + 1) },
    })
    expect(validateRequest(request)).toEqual({ ok: false, code: 'OCR_FILE_TOO_LARGE' })
  })

  it('rejects unsupported content types', () => {
    const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'image/webp' } })
    expect(validateRequest(request)).toEqual({ ok: false, code: 'OCR_INVALID_FILE' })
  })

  it('rejects MIME and signature mismatch', () => {
    const pngSignedAsJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(validateImage(pngSignedAsJpeg, 'image/jpeg').code).toBe('OCR_INVALID_FILE')
  })

  it('accepts JPEG end marker and PNG IHDR/IEND shape', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x10, 0xff, 0xd9])
    expect(validateImage(jpeg, 'image/jpeg')).toEqual({ ok: true })
    const png = new Uint8Array(45)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    png.set([0x49, 0x48, 0x44, 0x52], 12)
    png.set([0, 0, 0, 1], 16)
    png.set([0, 0, 0, 1], 20)
    png.set([0x49, 0x45, 0x4e, 0x44], 33)
    expect(validateImage(png, 'image/png')).toEqual({ ok: true })
  })

  it('submits the JSON Analyze Document overload with base64Source', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    const result = await submitAzureRead(
      'https://example.azure.com',
      'synthetic-key',
      'image/png',
      bytes,
      Date.now(),
      58_000,
      undefined,
      fetchMock as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://example.azure.com/documentintelligence/documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30',
    )
    expect(init?.headers).toEqual({
      'Ocp-Apim-Subscription-Key': 'synthetic-key',
      'Content-Type': 'application/json',
    })
    expect(typeof init?.body).toBe('string')
    expect(JSON.parse(init?.body as string)).toEqual({
      base64Source: encodeBytesAsBase64(bytes),
    })
    expect(init?.body).not.toBe(bytes)
    expect(init?.body).not.toBeInstanceOf(Uint8Array)
  })

  it('returns OCR_TIMEOUT after the bounded timeout', async () => {
    const result = await pollAzureRead('https://example.invalid/status', vi.fn(), Date.now() - 58_000)
    expect(result).toEqual({ ok: false, code: 'OCR_TIMEOUT' })
  })

  it('returns provider failure for a failed Azure operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed' }), { status: 200 }))
    const result = await pollAzureRead('https://example.invalid/status', fetchMock, Date.now() - 1000)
    expect(result).toEqual({ ok: false, code: 'OCR_PROVIDER_ERROR' })
  })

  it('returns required CORS headers for allowlisted and unknown origins', () => {
    expect(getCorsHeaders('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(getCorsHeaders('https://contractvault-puce.vercel.app')['Access-Control-Allow-Origin']).toBe('https://contractvault-puce.vercel.app')
    expect(getCorsHeaders('https://unknown.example')['Access-Control-Allow-Origin']).toBeUndefined()
    expect(getCorsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('rejects empty body and accepts oversized body classification', () => {
    const empty = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'image/jpeg', 'content-length': '0' } })
    expect(validateRequest(empty)).toEqual({ ok: false, code: 'OCR_INVALID_FILE' })
    const oversized = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'image/jpeg', 'content-length': String(OCR_MAX_BODY_BYTES + 1) } })
    expect(validateRequest(oversized)).toEqual({ ok: false, code: 'OCR_FILE_TOO_LARGE' })
  })

  it('rejects invalid Operation-Location URLs', () => {
    expect(validateOperationLocation('http://example.azure.com/status', 'https://example.azure.com')).toBe(false)
    expect(validateOperationLocation('https://other.azure.com/status', 'https://example.azure.com')).toBe(false)
    expect(validateOperationLocation('https://user@example.azure.com/status', 'https://example.azure.com')).toBe(false)
    expect(validateOperationLocation(null, 'https://example.azure.com')).toBe(false)
    expect(validateOperationLocation('https://example.azure.com/status/1', 'https://example.azure.com')).toBe(true)
  })

  it('stalled Azure analysis POST returns OCR_TIMEOUT', async () => {
    vi.useFakeTimers()
    const stalledFetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const request = submitAzureRead(
      'https://example.azure.com',
      'synthetic-key',
      'image/jpeg',
      new Uint8Array([1]),
      Date.now(),
      58_000,
      undefined,
      stalledFetch as typeof fetch,
    )
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(request).resolves.toEqual({ ok: false, code: 'OCR_TIMEOUT' })
    vi.useRealTimers()
  })

  it('stalled Azure polling GET returns OCR_TIMEOUT', async () => {
    vi.useFakeTimers()
    const stalledFetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const request = pollAzureRead(
      'https://example.azure.com/status/1',
      stalledFetch as typeof fetch,
      Date.now(),
      58_000,
    )
    await vi.advanceTimersByTimeAsync(11_000)
    await expect(request).resolves.toEqual({ ok: false, code: 'OCR_TIMEOUT' })
    vi.useRealTimers()
  })
})
