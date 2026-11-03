import { supabase } from '../lib/supabase'

export type OcrErrorCode =
  | 'OCR_UNAUTHORIZED'
  | 'OCR_INVALID_FILE'
  | 'OCR_FILE_TOO_LARGE'
  | 'OCR_PROVIDER_ERROR'
  | 'OCR_TIMEOUT'
  | 'OCR_NO_TEXT'

export const OCR_FRONTEND_TIMEOUT_MS = 65_000

export async function runOcrImage(preparedBlob: Blob, originalFileName: string, replacementSignal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('OCR_UNAUTHORIZED')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_FRONTEND_TIMEOUT_MS)
  const abortReplacement = () => controller.abort()

  if (replacementSignal?.aborted) {
    abortReplacement()
  } else {
    replacementSignal?.addEventListener('abort', abortReplacement, { once: true })
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ocr-read`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publishableKey,
        'Content-Type': 'image/jpeg',
        'X-File-Name': safeName,
      },
      body: preparedBlob,
      signal: controller.signal,
    })

    const result = await response.json().catch(() => ({ code: 'OCR_PROVIDER_ERROR' }))
    if (!response.ok) {
      const allowed = new Set<OcrErrorCode>([
        'OCR_UNAUTHORIZED', 'OCR_INVALID_FILE', 'OCR_FILE_TOO_LARGE',
        'OCR_PROVIDER_ERROR', 'OCR_TIMEOUT', 'OCR_NO_TEXT',
      ])
      throw new Error(allowed.has(result.code) ? result.code : 'OCR_PROVIDER_ERROR')
    }
    return {
      text: typeof result.text === 'string' ? result.text : '',
      pages: typeof result.pages === 'number' ? result.pages : 1,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('OCR_TIMEOUT')
    if (error instanceof Error && error.name === 'AbortError') throw new Error('OCR_TIMEOUT')
    if (error instanceof Error && error.message.startsWith('OCR_')) throw error
    throw new Error('OCR_PROVIDER_ERROR')
  } finally {
    clearTimeout(timeout)
    replacementSignal?.removeEventListener('abort', abortReplacement)
  }
}
