import type { InvoiceExtraction } from './pdfText'

const monthNames: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, décembre: 12, decembre: 12,
  märz: 3, maerz: 3, januar: 1, februar: 2,
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const text = value.trim()

  let match = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (match) return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))

  match = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/) ?? text.match(/\b(\d{1,2})[.-](\d{1,2})[.-](\d{2})\b/)
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    return toIsoDate(year, Number(match[2]), Number(match[1]))
  }

  match = text.match(/\b(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{4})\b/i)
  if (match) {
    const month = monthNames[match[2].toLowerCase().replace(/,/g, '')]
    if (month) return toIsoDate(Number(match[3]), month, Number(match[1]))
  }

  match = text.match(/\b([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{1,2}),?\s+(\d{4})\b/i)
  if (match) {
    const month = monthNames[match[1].toLowerCase()]
    if (month) return toIsoDate(Number(match[3]), month, Number(match[2]))
  }

  return undefined
}

function parseAmount(value: string): string | undefined {
  const matches = value.match(/(?:CHF|EUR|USD|\b[A-Z]{3}\b)?\s*[0-9][0-9'’.,\s]*(?:[.,][0-9]{1,2})?/gi)
  if (!matches) return undefined

  const candidates = matches.map((candidate) => candidate.replace(/(?:CHF|EUR|USD|\b[A-Z]{3}\b)/gi, '').replace(/[\s'’]/g, '')).filter(Boolean)
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    let normalized = candidates[index]
    if (/^[0-9]{1,2}[.-][0-9]{1,2}[.-][0-9]{4}$/.test(normalized)) continue
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '')
    } else if (normalized.includes(',')) {
      normalized = normalized.split(',')[1]?.length === 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
    } else if (normalized.includes('.')) {
      const parts = normalized.split('.')
      if (parts.length > 1 && parts[parts.length - 1].length === 2) {
        normalized = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
      } else if (parts.length > 2 || parts[parts.length - 1].length === 3) {
        normalized = normalized.replace(/\./g, '')
      }
    }
    const number = Number(normalized)
    if (Number.isFinite(number) && number >= 0 && number.toFixed(2).split('.')[1]?.length === 2) return number.toFixed(2)
  }
  return undefined
}

function cleanLabelledValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const clean = value.replace(/^\s*(?:[:#-]\s*)/, '').replace(/\s+/g, ' ').trim()
  return clean || undefined
}

function extractTitle(text: string, _fileName: string): { value?: string; confidence: number; reviewRequired?: boolean } {
  const firstPage = text.split(/--- PAGE BREAK ---/)[0] ?? ''
  const heading = firstPage.split(/\n|\r/).map((line) => line.trim()).find((line) => /^(?:invoice|rechnung|factura|fattura|facture)(?:\b|\s)/i.test(line))
  if (heading) {
    const title = heading.replace(/\b(?:N[°º]|No\.?|Number|Nr\.?)\s*[A-Za-z0-9./-]+.*$/i, '').replace(/\s+/g, ' ').trim()
    if (title && title.length <= 120) return { value: title, confidence: 0.82 }
  }
  return { confidence: 0.2 }
}

function extractInvoiceNumber(text: string): string | undefined {
  const patterns = [
    /Fattura(?:\s+dei premi)?\s*N[°º]\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i,
    /Fattura\s*N[°º]\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i,
    /(?:Invoice\s*(?:No\.?|Number|#)|Rechnung\s*Nr\.?|Rechnungsnummer|Numero\s+fattura|Numéro\s+de\s+facture|Facture\s*N[°º])\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].replace(/^[#:.-]+/, '').trim()
  }
  return undefined
}

function extractSupplier(text: string): { value?: string; confidence: number; reviewRequired?: boolean } {
  const badPrefix = /^(?:una\s+società\s+di|eine\s+gesellschaft\s+der|a\s+company\s+of|une\s+société\s+de)/i
  const legalEntity = /\b(?:SA|AG|GmbH|Sàrl|SARL|Sarl|Ltd\.?|Limited|Inc\.?)\b/i

  const labelled = text.match(/(?:Supplier|Issuer|Vendor|Lieferant|Aussteller|Fornitore|Emittente|Prestataire|Bénéficiaire|Destinataire du paiement|Payment recipient|Beneficiary)\s*[:#-]?\s*([^\n\r]+)/i)
  if (labelled?.[1]) {
    const clean = cleanLabelledValue(labelled[1])?.replace(badPrefix, '').trim()
    if (clean && clean.length <= 150) return { value: clean, confidence: legalEntity.test(clean) ? 0.88 : 0.78, reviewRequired: !legalEntity.test(clean) }
  }

  const recipient = text.match(/(?:Beneficiario|Destinataire|Payment recipient|Empfänger|Recipient)[^\n\r]{0,100}[:#-]?\s*([^\n\r]+)/i)
  if (recipient?.[1]) {
    const clean = cleanLabelledValue(recipient[1])?.replace(badPrefix, '').trim()
    if (clean && legalEntity.test(clean) && clean.length <= 150) return { value: clean, confidence: 0.92, reviewRequired: false }
  }

  const candidates = new Map<string, number>()
  for (const line of text.split(/\n|\r/).map((value) => value.trim()).filter(Boolean)) {
    if (badPrefix.test(line) || !legalEntity.test(line) || /(?:CH[- ]?\d{4}|IBAN|tel|phone|policy|polizza|customer|client)/i.test(line)) continue
    const cleaned = line.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, '').replace(/\b(?:CH-)?\d{4}\b.*$/i, '').trim()
    if (cleaned.length >= 4 && cleaned.length <= 150) candidates.set(cleaned, (candidates.get(cleaned) ?? 0) + 1)
  }
  if (candidates.size === 1) {
    const [value] = candidates.keys()
    return { value, confidence: 0.72, reviewRequired: true }
  }
  return { confidence: 0.2 }
}

function isPostalOrIdentifierContext(line: string): boolean {
  const lower = line.toLowerCase()
  return /\b(?:ch[- ]?\d{4}|n\.?\s*\d{4,}|postal|adresse|address|telefono|phone|tel\.?|customer|client number|kundennummer|n\. cliente|polizza|policy|assicurato|avv\. |iban|reference|rif\.|référence|numero)\b/i.test(lower)
}

function findStrongTotal(text: string): { value?: string; confidence: number; reviewRequired: boolean } {
  const strongLabels = [
    'totale da versarci', 'totale da pagare', 'importo totale', 'totale fattura',
    'total amount', 'amount due', 'total due', 'gesamtbetrag', 'zahlbetrag',
    'montant dû', 'montant à payer', 'rechnungsbetrag', 'totale da versare'
  ]
  const candidates = new Map<string, number>()
  const lines = text.split(/\n|\r|--- PAGE BREAK ---/)

  for (const line of lines) {
    const lowerLine = line.toLowerCase()
    const matchedLabel = strongLabels.find((label) => lowerLine.includes(label))
    if (!matchedLabel || isPostalOrIdentifierContext(line)) continue

    const currencyMatches = [...line.matchAll(/(?:CHF|EUR|USD)\s*([0-9]{1,3}(?:[’' ]?[0-9]{3})*(?:[.,][0-9]{1,2}))/gi)]
    for (const match of currencyMatches) {
      const amount = parseAmount(match[1])
      if (!amount) continue
      candidates.set(amount, (candidates.get(amount) ?? 0) + (matchedLabel === 'totale da versarci' ? 20 : 14))
    }
  }

  if (candidates.size === 0) return { confidence: 0, reviewRequired: true }
  if (candidates.size > 1) return { confidence: 0.55, reviewRequired: true }

  const best = [...candidates.keys()][0]
  const paymentAmounts = [...text.matchAll(/(?:CHF|EUR|USD)\s*([0-9]{1,3}(?:[’' ]?[0-9]{3})*(?:[.,][0-9]{1,2}))/gi)]
    .map((match) => parseAmount(match[1]))
    .filter((value): value is string => Boolean(value))
  const repeatedInPaymentSection = paymentAmounts.includes(best)

  return {
    value: best,
    confidence: repeatedInPaymentSection ? 0.99 : 0.92,
    reviewRequired: !repeatedInPaymentSection,
  }
}

function extractDueDate(text: string): { value?: string; confidence: number; reviewRequired?: boolean } {
  const dueMatch = text.match(/(?:Due\s*Date|Fällig(?: am)?|Fälligkeit|Pagabile entro|Échéance|Date d['’ ]?échéance)[^\n\r]{0,50}/gi)
  if (dueMatch) {
    const parsed = parseDate(dueMatch[0])
    if (parsed) return { value: parsed, confidence: 0.92 }
  }
  const italianPayable = text.match(/(?:entro\s+(?:il\s+)?)(\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})/i)
  if (italianPayable) {
    const parsed = parseDate(italianPayable[1])
    if (parsed) return { value: parsed, confidence: 0.94 }
  }
  return { confidence: 0 }
}

export function extractInvoice(fileName: string, text: string): InvoiceExtraction {
  const result: InvoiceExtraction = {}
  const title = extractTitle(text, fileName)
  result.documentName = title

  const invoiceNumber = extractInvoiceNumber(text)
  if (invoiceNumber) result.invoiceNumber = { value: invoiceNumber, confidence: 0.96 }

  const supplier = extractSupplier(text)
  if (supplier.value) result.supplier = supplier

  const dateLineMatch = text.match(/(?:Martigny|[A-Za-zÀ-ÿ]+),\s*(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})/i)
    ?? text.match(/(?:\b)(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})(?:\b)/i)
  if (dateLineMatch) {
    const date = parseDate(dateLineMatch[1])
    if (date) result.invoiceDate = { value: date, confidence: 0.9 }
  } else {
    const labelled = text.match(/(?:Invoice Date|Rechnungsdatum|Data fattura|Date de facture)\s*[:#-]?\s*([^\n\r]+)/i)
    const date = parseDate(labelled?.[1])
    if (date) result.invoiceDate = { value: date, confidence: 0.88 }
  }

  const due = extractDueDate(text)
  if (due.value) result.dueDate = due

  const total = findStrongTotal(text)
  if (total.value) result.totalAmount = total

  const netMatch = text.match(/(?:Net(?: Amount)?|Netto|Subtotal|Zwischensumme)[^\n\r]{0,100}(?:CHF|EUR|USD)?\s*([0-9][0-9'’.,]*)/i)
  if (netMatch?.[1]) {
    const net = parseAmount(netMatch[0])
    if (net) result.netAmount = { value: net, confidence: 0.78, reviewRequired: false }
  }

  const taxMatch = text.match(/(?:VAT|Tax|MwSt|MWST|TVA|IVA)[^\n\r]{0,100}(?:CHF|EUR|USD)?\s*([0-9][0-9'’.,]*)/i)
  if (taxMatch?.[1]) {
    const tax = parseAmount(taxMatch[0])
    if (tax) result.taxAmount = { value: tax, confidence: 0.78, reviewRequired: false }
  }

  const currencyMatch = text.match(/\b(CHF|EUR|USD)\b/i)
  if (currencyMatch) result.currency = { value: currencyMatch[1].toUpperCase(), confidence: 0.96 }

  const reference = text.match(/(?:Payment Reference|Zahlungszweck|QR-Reference|Riferimento pagamento|Référence de paiement)[^\n\r]{0,80}\b([A-Z0-9][A-Z0-9 -]{4,34})/i)
  if (reference?.[1]) result.paymentReference = { value: reference[1].trim().slice(0, 100), confidence: 0.72, reviewRequired: true }

  const lower = text.toLowerCase()
  if (/\bunpaid\b|\boffener betrag\b|\bnicht bezahlt\b|\bnon pagato\b|\bimpayée\b|\bimpayé\b/.test(lower)) {
    result.paymentStatus = { value: 'unpaid', confidence: 0.78 }
  } else if (/\bpaid\b|\bezahlt\b|\bpagato\b|\bpayée\b|\bpayé\b/.test(lower)) {
    result.paymentStatus = { value: 'paid', confidence: 0.65, reviewRequired: true }
  } else {
    result.paymentStatus = { value: 'unpaid', confidence: 0.6 }
  }

  return result
}
