export type OcrErrorCode = 'OCR_UNAUTHORIZED' | 'OCR_INVALID_FILE' | 'OCR_FILE_TOO_LARGE' | 'OCR_PROVIDER_ERROR' | 'OCR_TIMEOUT' | 'OCR_NO_TEXT'

export const OCR_MAX_BODY_BYTES = 4.5 * 1024 * 1024
export const ALLOWED_OCR_ORIGINS = new Set([
  'http://localhost:5173',
  'https://contractvault-puce.vercel.app',
  'https://contractvault-git-feature-photo-ocr-milestone-1-gtrz-82.vercel.app',
])

const ALLOWED_AZURE_ERROR_CODES = new Set([
  'InvalidArgument',
  'InvalidRequest',
  'InvalidImage',
  'ImageSizeLimitExceeded',
  'NotSupported',
  'Unauthorized',
  'Forbidden',
  'TooManyRequests',
  'InternalServerError',
  'ServiceUnavailable',
  'OperationFailed',
])

export function getSafeAzureErrorCode(value: string | null) {
  return value && ALLOWED_AZURE_ERROR_CODES.has(value) ? value : undefined
}

export function encodeBytesAsBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function logOcrDiagnostic(
  stage: string,
  category: string,
  status?: number,
  azureErrorCode?: string,
) {
  const diagnostic: Record<string, string | number> = { stage, category }
  if (typeof status === 'number') diagnostic.status = status
  if (azureErrorCode) diagnostic.azureErrorCode = azureErrorCode
  console.error(diagnostic)
}

export function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-file-name',
  }
  if (origin && ALLOWED_OCR_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export function validateRequest(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
    return { ok: false as const, code: 'OCR_INVALID_FILE' as OcrErrorCode }
  }
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) === 0) {
    return { ok: false as const, code: 'OCR_INVALID_FILE' as OcrErrorCode }
  }
  if (contentLength && Number(contentLength) > OCR_MAX_BODY_BYTES) {
    return { ok: false as const, code: 'OCR_FILE_TOO_LARGE' as OcrErrorCode }
  }
  return { ok: true as const, contentType }
}

export function validateImage(bytes: Uint8Array, contentType: string) {
  if (bytes.byteLength === 0) {
    return { ok: false as const, code: 'OCR_INVALID_FILE' as OcrErrorCode }
  }
  if (bytes.byteLength > OCR_MAX_BODY_BYTES) {
    return { ok: false as const, code: 'OCR_FILE_TOO_LARGE' as OcrErrorCode }
  }

  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
  const png = bytes.length >= 33 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a &&
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52 &&
    bytes[bytes.length - 12] === 0x49 && bytes[bytes.length - 11] === 0x45 &&
    bytes[bytes.length - 10] === 0x4e && bytes[bytes.length - 9] === 0x44

  let validDimensions = false
  if (contentType === 'image/png' && png) {
    const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16)
    const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20)
    validDimensions = width > 0 && height > 0 && width <= 100_000 && height <= 100_000
  } else if (contentType === 'image/jpeg' && jpeg) {
    for (let index = 2; index + 8 < bytes.length;) {
      if (bytes[index] !== 0xff) { index++; continue }
      const marker = bytes[index + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const height = view.getUint16(index + 5)
        const width = view.getUint16(index + 7)
        validDimensions = width > 0 && height > 0 && width <= 100_000 && height <= 100_000
        break
      }
      index += 2
    }
  }

  if ((contentType === 'image/jpeg' && !jpeg) || (contentType === 'image/png' && !png)) {
    return { ok: false as const, code: 'OCR_INVALID_FILE' as OcrErrorCode }
  }
  if (!validDimensions) {
    return { ok: false as const, code: 'OCR_INVALID_FILE' as OcrErrorCode }
  }
  return { ok: true as const }
}

export function getTextFromAzureResult(result: { analyzeResult?: { content?: string } }) {
  const text = result.analyzeResult?.content
  return typeof text === 'string' ? text.trim() : ''
}

export function validateOperationLocation(operationLocation: string | null, azureEndpoint: string) {
  if (!operationLocation) return false
  try {
    const operationUrl = new URL(operationLocation)
    const endpointUrl = new URL(azureEndpoint)
    return operationUrl.protocol === 'https:' &&
      !operationUrl.username &&
      !operationUrl.password &&
      operationUrl.origin === endpointUrl.origin
  } catch {
    return false
  }
}

export async function submitAzureRead(
  endpoint: string,
  key: string,
  contentType: string,
  bytes: Uint8Array,
  startedAt = Date.now(),
  overallDeadlineMs = 58_000,
  clientSignal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
) {
  const remaining = overallDeadlineMs - (Date.now() - startedAt)
  if (remaining <= 0 || clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
  const controller = new AbortController()
  const cancelClient = () => controller.abort()
  if (clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
  clientSignal?.addEventListener('abort', cancelClient, { once: true })
  const timeout = setTimeout(() => controller.abort(), Math.min(15_000, remaining))
  try {
    const response = await fetchImpl(
      `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30`,
      {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Source: encodeBytesAsBase64(bytes) }),
        signal: controller.signal,
      },
    )
    if (controller.signal.aborted || clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    return { ok: true as const, response }
  } catch {
    if (controller.signal.aborted || clientSignal?.aborted) {
      logOcrDiagnostic('azure-analyze-submit', 'timeout')
      return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    }
    logOcrDiagnostic('azure-analyze-submit', 'network-failure')
    return { ok: false as const, code: 'OCR_PROVIDER_ERROR' as OcrErrorCode }
  } finally {
    clearTimeout(timeout)
    clientSignal?.removeEventListener('abort', cancelClient)
  }
}

export async function pollAzureRead(
  operationLocation: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
  startedAt = Date.now(),
  overallDeadlineMs = 58_000,
  clientSignal?: AbortSignal,
) {
  const schedule = [1000, 1000, 1505, 2005, 3000, 5000, 5000, 5000, 5000, 5000]
  for (let index = 0; index < schedule.length; index++) {
    if (clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    if (Date.now() - startedAt >= overallDeadlineMs) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    await new Promise((resolve) => setTimeout(resolve, schedule[index]))
    if (clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    if (Date.now() - startedAt >= overallDeadlineMs) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }

    let response: Response
    const controller = new AbortController()
    const cancelClient = () => controller.abort()
    if (clientSignal?.aborted) return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
    clientSignal?.addEventListener('abort', cancelClient, { once: true })
    const individualTimeout = setTimeout(() => controller.abort(), 10_000)
    try {
      response = await fetchImpl(operationLocation, {
        method: 'GET',
        headers: { 'Ocp-Apim-Subscription-Key': key },
        signal: controller.signal,
      })
    } catch {
      clearTimeout(individualTimeout)
      clientSignal?.removeEventListener('abort', cancelClient)
      if (controller.signal.aborted || clientSignal?.aborted) {
        logOcrDiagnostic('azure-polling', 'timeout')
        return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
      }
      logOcrDiagnostic('azure-polling', 'network-failure')
      return { ok: false as const, code: 'OCR_PROVIDER_ERROR' as OcrErrorCode }
    }
    clearTimeout(individualTimeout)
    clientSignal?.removeEventListener('abort', cancelClient)
    if (!response.ok) {
      logOcrDiagnostic('azure-polling', 'http-failure', response.status)
      return { ok: false as const, code: 'OCR_PROVIDER_ERROR' as OcrErrorCode }
    }
    const result = await response.json().catch(() => null) as { status?: string; analyzeResult?: { content?: string } } | null
    if (!result || typeof result !== 'object') {
      logOcrDiagnostic('azure-polling', 'malformed-json', response.status)
      return { ok: false as const, code: 'OCR_PROVIDER_ERROR' as OcrErrorCode }
    }
    const status = result.status?.toLowerCase()
    if (status === 'succeeded') {
      if (!result.analyzeResult || typeof result.analyzeResult !== 'object') {
        logOcrDiagnostic('azure-polling', 'malformed-final-result', response.status)
        return { ok: false as const, code: 'OCR_NO_TEXT' as OcrErrorCode }
      }
      const text = getTextFromAzureResult(result)
      if (text) return { ok: true as const, text }
      logOcrDiagnostic(
        'azure-polling',
        typeof result.analyzeResult.content === 'string' ? 'no-usable-ocr-text' : 'malformed-final-result',
        response.status,
      )
      return { ok: false as const, code: 'OCR_NO_TEXT' as OcrErrorCode }
    }
    if (status === 'failed') {
      logOcrDiagnostic('azure-polling', 'analysis-failed', response.status)
      return { ok: false as const, code: 'OCR_PROVIDER_ERROR' as OcrErrorCode }
    }
    if (!status || (status !== 'running' && status !== 'notstarted')) {
      logOcrDiagnostic('azure-polling', 'malformed-polling-response', response.status)
    }
  }
  return { ok: false as const, code: 'OCR_TIMEOUT' as OcrErrorCode }
}
