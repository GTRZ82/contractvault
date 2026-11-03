export type DocumentType = 'contract' | 'invoice'

export function resolveDocumentType(
  classification: DocumentType,
  explicitlySelected: DocumentType | null,
): DocumentType {
  return explicitlySelected ?? classification
}

export function classifyDocument(text: string): { type: DocumentType; confidence: number } {
  const normalized = text.toLowerCase()

  const invoicePatterns = [
    /\b(?:invoice number|invoice no\.?|rechnungsnummer|rechnung nr\.?|numero fattura|numéro de facture|fattura n[°º]?|facture n[°º]?|due date|fälligkeitsdatum|pagabile entro|échéance|amount due|total due|montant dû|gesamtbetrag|zahlbetrag|payment reference|qr-reference|iban)\b/i,
    /^\s*(?:invoice|rechnung|fattura|facture|factura)\b/im,
  ]

  const contractPatterns = [
    /\b(?:service agreement|subscription agreement|insurance policy|polizza d['’]?assicurazione|versicherungs?police|police d['’]?assurance|agreement|vereinbarung|vertragsabschluss|contratto|contrat)\b/i,
    /\b(?:insurer|assicuratore|versicherer|assureur|policyholder|contraente|versicherungsnehmer|preneur d['’]?assurance)\b/i,
    /\b(?:start date|commencement|effective date|data di decorrenza|inizio validità|beginn|vertragsbeginn|date de début|début)\b/i,
    /\b(?:expiry date|expiration date|end date|data scadenza|scadenza|ablaufdatum|expiration|échéance|date de fin)\b/i,
    /\b(?:automatic(?:ally)? renewal|tacit renewal|automatic(?:ally)? renew|rinnovo tacito|si rinnova automaticamente|stillschweigende verlängerung|automatische verlängerung|renouvellement tacite|renouvellement automatique)\b/i,
    /\b(?:terms and conditions|condizioni generali|allgemeine bedingungen|conditions générales)\b/i,
  ]

  let invoiceScore = 0
  for (const pattern of invoicePatterns) if (pattern.test(normalized)) invoiceScore += pattern.source.startsWith('^') ? 2 : 1.5

  let contractScore = 0
  for (const pattern of contractPatterns) if (pattern.test(normalized)) contractScore += 2

  if (/\b(?:premium|monthly fee|subscription price|prämie|premio assicurativo)\b/i.test(normalized) && !contractScore) invoiceScore += 0.5

  if (contractScore >= 4 && contractScore > invoiceScore) {
    return { type: 'contract', confidence: Math.min(0.99, 0.82 + contractScore * 0.025) }
  }
  if (invoiceScore >= 3 && invoiceScore > contractScore) {
    return { type: 'invoice', confidence: Math.min(0.99, 0.82 + invoiceScore * 0.025) }
  }
  if (contractScore > invoiceScore && contractScore > 0) {
    return { type: 'contract', confidence: 0.55 + Math.min(0.25, contractScore * 0.05) }
  }
  if (invoiceScore > contractScore && invoiceScore > 0) {
    return { type: 'invoice', confidence: 0.55 + Math.min(0.25, invoiceScore * 0.05) }
  }
  return { type: 'contract', confidence: 0.45 }
}
