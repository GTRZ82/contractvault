import type { ContractExtraction } from './pdfText'

function labelledValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}\\s*[:#-]?\\s*([^\\n\\r]+)`, 'i'))
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const makeIso = (year: number, month: number, day: number): string | undefined => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  let match = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (match) return makeIso(Number(match[1]), Number(match[2]), Number(match[3]))
  match = value.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/)
  if (match) return makeIso(Number(match[3]), Number(match[2]), Number(match[1]))
  match = value.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{2})/)
  if (match) return makeIso(2000 + Number(match[3]), Number(match[2]), Number(match[1]))

  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, december: 12,
    januari: 1, februar: 2, märz: 3, marz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
    janvier: 1, février: 2, fevrier: 2, mars: 3, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, décembre: 12, decembre: 12,
    gennaio: 1, febbraio: 2, marzo: 3, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    november: 11,
  }
  match = value.match(/(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{4})/i)
  if (match) {
    const month = months[match[2].toLowerCase().replace(/,/g, '')]
    if (month) return makeIso(Number(match[3]), month, Number(match[1]))
  }
  return undefined
}

function parseAmount(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/[0-9][0-9'’,.\s]*[0-9]/)
  if (!match) return undefined
  let normalized = match[0].replace(/[’']/g, '').replace(/\s/g, '')
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')
  } else if (normalized.includes(',')) {
    normalized = normalized.split(',')[1]?.length === 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
  } else if (normalized.includes('.')) {
    const parts = normalized.split('.')
    if (parts.length > 2 || parts[parts.length - 1]?.length === 3) normalized = normalized.replace(/\./g, '')
  }
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : undefined
}

function isInvalidCounterpartyCandidate(candidate: string): boolean {
  const value = candidate.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, '').replace(/\s+/g, ' ').trim()
  if (!value || value.length < 4 || value.length > 150) return true
  if (/[@]/.test(value) || /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(value)) return true
  if (/^(?:signor|signora|herr|frau|monsieur|madame|mr|mrs|ms|miss)\b/i.test(value)) return true
  if (/^(?:e-mail|email|phone|telephone|tel\.?|fax|contact|address|adresse|postal|street|strasse|via|rue)\b/i.test(value)) return true

  const digits = value.match(/[0-9]/g)?.length ?? 0
  if (digits >= 6) return true
  if (/\+?[0-9][0-9 ()./-]{7,}/.test(value)) return true
  if (/\b(?:CH[- ]?\d{4}|[A-Z]{1,2}-?\d{3,5}|\d{1,4}\s+(?:street|st|avenue|ave|road|rd|via|rue|strasse))\b/i.test(value)) return true

  const words = value.match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9.&'’-]*/g) ?? []
  if (words.length === 0) return true
  return false
}

function extractCounterparty(text: string): { value?: string; confidence: number; reviewRequired?: boolean } {
  const legalEntityPattern = /\b(?:SA|AG|GmbH|Sàrl|SARL|Sarl|Ltd\.?|Limited|Inc\.?|LLC)\b/i
  const candidates: string[] = []
  const labelledPattern = /(?:insurer|assicuratore|versicherer|assureur|supplier|vendor|counterparty|client|auftraggeber|gegenpartei|controparte|partie)[^\n\r]{0,100}[:#-]?\s*([^\n\r]{2,150})/gi

  for (const match of text.matchAll(labelledPattern)) {
    if (match[1]) candidates.push(match[1].trim())
  }
  for (const line of text.split(/\n|\r/).map((value) => value.trim()).filter(Boolean)) {
    if (legalEntityPattern.test(line)) candidates.push(line)
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const legalMatch = candidate.match(/[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9.&'’-]*(?:\s+[A-ZÀ-ÖØ-ÞA-Za-zÀ-ÖØ-öø-ÿ0-9.&'’-]+){0,7}\s+(?:SA|AG|GmbH|Sàrl|SARL|Sarl|Ltd\.?|Limited|Inc\.?|LLC)\b/i)
    const value = (legalMatch?.[0] ?? candidate).replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, '').replace(/\s+/g, ' ').trim()
    const key = value.toLowerCase()
    if (seen.has(key) || isInvalidCounterpartyCandidate(value)) continue
    seen.add(key)

    if (legalEntityPattern.test(value)) {
      return { value, confidence: 0.92, reviewRequired: false }
    }
    const personName = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3}$/.test(value)
    if (personName) return { value, confidence: 0.78, reviewRequired: true }
  }
  return { confidence: 0.2 }
}

export function extractContract(_fileName: string, text: string): ContractExtraction {
  const result: ContractExtraction = {}
  const firstPage = text.split(/--- PAGE BREAK ---/)[0] ?? ''
  const headingMatch = firstPage.match(/\b(?:Insurance Policy(?:\s+\d{4})?|Polizza d['’]?assicurazione(?:\s+\d{4})?|Versicherungspolice|Police d['’]?assurance|Service Agreement|Subscription Agreement|Contract Agreement|Agreement)\b/i)
  if (headingMatch?.[0] && headingMatch[0].length <= 160) result.documentName = { value: headingMatch[0].replace(/\s+/g, ' ').trim(), confidence: 0.88, reviewRequired: false }

  const counterparty = extractCounterparty(text)
  if (counterparty.value) result.counterparty = counterparty

  const owner = labelledValue(text, ['Contract Owner', 'Vertragsverantwortliche', 'Verantwortlicher', 'Owner', 'Responsabile', 'Responsable'])
  if (owner && !/@/.test(owner) && !/^\d+$/.test(owner.trim())) result.contractOwner = { value: owner.slice(0, 150), confidence: 0.72, reviewRequired: true }

  const startRaw = labelledValue(text, ['Start Date', 'Effective Date', 'Commencement', 'Inizio', 'Data inizio', 'Beginn', 'Vertragsbeginn', 'Début', 'Date de début'])
  const startDate = parseDate(startRaw)
  if (startDate) result.startDate = { value: startDate, confidence: 0.92 }

  const expiryRaw = labelledValue(text, ['Expiry Date', 'Expiration Date', 'End Date', 'Scadenza', 'Data scadenza', 'Ablaufdatum', 'Expiration', 'Échéance', 'Date de fin'])
  const expiryDate = parseDate(expiryRaw)
  if (expiryDate) result.expiryDate = { value: expiryDate, confidence: 0.92 }

  const valueMatch = text.match(/(?:contract value|annual value|total value|monthly fee|premium|subscription price|vertragswert|jahreswert|monatsgebühr|prämie|valore contratto|importo contratto|canone mensile|valeur du contrat|valeur annuelle|prime mensuelle)[^\n\r]{0,100}(?:CHF|EUR|USD)?\s*([0-9][0-9'’,.\s]*[0-9])/i)
  if (valueMatch?.[1]) {
    const contractValue = parseAmount(valueMatch[1])
    if (contractValue) result.contractValue = { value: contractValue, confidence: 0.82, reviewRequired: true }
    const currency = valueMatch[0].match(/\b(CHF|EUR|USD)\b/i)
    if (currency) result.currency = { value: currency[1].toUpperCase(), confidence: 0.92 }
  }

  const lower = text.toLowerCase()
  if (/automatic(?:ally)? renew(?:al)?|renews automatically|tacit renewal|rinnovo tacito|si rinnova automaticamente|stillschweigende verlängerung|renouvellement tacite|renouvellement automatique/i.test(lower)) {
    result.autoRenew = { value: true, confidence: 0.92 }
  }

  const noticeMatch = text.match(/(?:cancellation notice|termination notice|notice period|kündigungsfrist|frist zur kündigung|preavviso di disdetta|preavviso di recesso|délai de résiliation|préavis)[^0-9]{0,30}(\d{1,4})\s*(?:days?|tage|giorni|jours)/i)
  if (noticeMatch?.[1]) result.noticePeriod = { value: String(Number(noticeMatch[1])), confidence: 0.92 }

  return result
}
