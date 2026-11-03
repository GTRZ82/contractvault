import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import {
  getCorsHeaders,
  pollAzureRead,
  submitAzureRead,
  validateImage,
  validateOperationLocation,
  validateRequest,
  type OcrErrorCode,
} from './_shared.ts'

function errorResponse(code: OcrErrorCode, status: number, origin: string | null) {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') return errorResponse('OCR_INVALID_FILE', 405, origin)

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ') || !authHeader.slice(7).trim()) {
    return errorResponse('OCR_UNAUTHORIZED', 401, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return errorResponse('OCR_PROVIDER_ERROR', 500, origin)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7).trim())
  if (authError || !user) return errorResponse('OCR_UNAUTHORIZED', 401, origin)

  const requestCheck = validateRequest(request)
  if (!requestCheck.ok) {
    return errorResponse(
      requestCheck.code,
      requestCheck.code === 'OCR_FILE_TOO_LARGE' ? 413 : 400,
      origin,
    )
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await request.arrayBuffer())
  } catch {
    return errorResponse('OCR_INVALID_FILE', 400, origin)
  }
  const imageCheck = validateImage(bytes, requestCheck.contentType)
  if (!imageCheck.ok) {
    return errorResponse(
      imageCheck.code,
      imageCheck.code === 'OCR_FILE_TOO_LARGE' ? 413 : 400,
      origin,
    )
  }

  const endpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')?.replace(/\/$/, '')
  const key = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')
  if (!endpoint || !key) return errorResponse('OCR_PROVIDER_ERROR', 500, origin)
  try {
    const endpointUrl = new URL(endpoint)
    if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password) {
      return errorResponse('OCR_PROVIDER_ERROR', 500, origin)
    }
  } catch {
    return errorResponse('OCR_PROVIDER_ERROR', 500, origin)
  }

  const startedAt = Date.now()
  const deadlineMs = 58_000
  const submission = await submitAzureRead(
    endpoint,
    key,
    requestCheck.contentType,
    bytes,
    startedAt,
    deadlineMs,
    request.signal,
  )
  if (!submission.ok) {
    return errorResponse(
      submission.code,
      submission.code === 'OCR_TIMEOUT' ? 504 : 502,
      origin,
    )
  }
  const submitResponse = submission.response

  if (submitResponse.status === 401 || submitResponse.status === 403) {
    return errorResponse('OCR_UNAUTHORIZED', 502, origin)
  }
  if (!submitResponse.ok && submitResponse.status !== 202) {
    return errorResponse('OCR_PROVIDER_ERROR', 502, origin)
  }

  const operationLocation = submitResponse.headers.get('Operation-Location') ??
    submitResponse.headers.get('operation-location')
  if (!validateOperationLocation(operationLocation, endpoint)) {
    return errorResponse('OCR_PROVIDER_ERROR', 502, origin)
  }

  if (Date.now() - startedAt >= deadlineMs) return errorResponse('OCR_TIMEOUT', 504, origin)
  const result = await pollAzureRead(
    operationLocation as string,
    fetch,
    startedAt,
    58_000,
    request.signal,
  )
  if (!result.ok) {
    return errorResponse(result.code, result.code === 'OCR_TIMEOUT' ? 504 : 502, origin)
  }
  return new Response(JSON.stringify({ text: result.text, pages: 1 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
