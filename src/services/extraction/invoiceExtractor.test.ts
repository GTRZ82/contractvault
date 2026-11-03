import { describe, expect, it } from 'vitest'
import { classifyDocument, resolveDocumentType } from './documentClassifier'
import { extractInvoice } from './invoiceExtractor'
import { extractContract } from './contractExtractor'

const realDocument = `
Fattura dei premi N° 712177297
Martigny, 19 ottobre 2026
Groupe Mutuel Holding SA
Groupe Mutuel Assicurazioni GMA SA
Una società di Groupe Mutuel...
CH 1919 postal address
Premio assicurato CHF 68.85
Premio supplementare CHF 121.60
Importo cliente CHF 54.00
Totale da versarci entro il 30.11.2026 CHF 244.45
Payment recipient: Groupe Mutuel Assicurazioni GMA SA
Swiss payment section
CHF 244.45
`

describe('user-selected document type precedence', () => {
  it('keeps Invoice selected instead of an Invoice-classified PDF', () => {
    expect(resolveDocumentType('contract', 'invoice')).toBe('invoice')
  })

  it('keeps Contract selected instead of an Invoice-classified PDF', () => {
    expect(resolveDocumentType('invoice', 'contract')).toBe('contract')
  })

  it('uses classifier selection before the user makes an explicit choice', () => {
    expect(resolveDocumentType('invoice', null)).toBe('invoice')
  })
})

describe('real Italian insurance invoice extraction', () => {
  it('classifies the document as an invoice and extracts the expected fields', () => {
    expect(classifyDocument(realDocument).type).toBe('invoice')

    const extracted = extractInvoice('712177297_20261016_2026.pdf', realDocument)
    expect(extracted.documentName?.value).toBe('Fattura dei premi')
    expect(extracted.supplier?.value).toBe('Groupe Mutuel Assicurazioni GMA SA')
    expect(extracted.invoiceNumber?.value).toBe('712177297')
    expect(extracted.invoiceDate?.value).toBe('2026-10-19')
    expect(extracted.dueDate?.value).toBe('2026-11-30')
    expect(extracted.totalAmount?.value).toBe('244.45')
    expect(extracted.currency?.value).toBe('CHF')
    expect(extracted.paymentStatus?.value).toBe('unpaid')
  })
})

describe('generic invoice extraction safety', () => {
  it('leaves total amount blank when strong totals conflict', () => {
    const text = `Invoice
Invoice Number: INV-204
Total Amount: CHF 100.00
Amount Due: CHF 125.00`
    const extracted = extractInvoice('invoice.pdf', text)
    expect(extracted.totalAmount?.value).toBeUndefined()
  })

  it('does not fall back to line-item amounts without a strong total label', () => {
    const text = `Invoice 204
Customer Number: 1919
Premium CHF 68.85
Additional charge CHF 121.60`
    const extracted = extractInvoice('invoice.pdf', text)
    expect(extracted.totalAmount?.value).toBeUndefined()
  })
})

describe('generic insurance policy regression', () => {
  it('classifies and extracts a contract from independent contractual indicators', () => {
    const policy = `Insurance Policy 2027
Policyholder: Example Organization
Insurer: Example Insurance SA
Start Date: 01/01/2027
Expiry Date: 31/12/2027
The policy includes tacit renewal and renews automatically.`

    const classification = classifyDocument(policy)
    expect(classification.type).toBe('contract')
    expect(classification.confidence).toBeGreaterThanOrEqual(0.9)

    const extracted = extractContract('policy.pdf', policy)
    expect(extracted.documentName?.value).toBe('Insurance Policy 2027')
    expect(extracted.startDate?.value).toBe('2027-01-01')
    expect(extracted.expiryDate?.value).toBe('2027-12-31')
    expect(extracted.autoRenew?.value).toBe(true)
  })

  it('rejects invalid counterparty candidates and uses the next legal entity', () => {
    const policy = `Insurance Policy
Insurer: i@company.example Signor
Client records: Frau
Example Insurance SA
Start Date: 01/01/2027`
    const extracted = extractContract('policy.pdf', policy)
    expect(extracted.counterparty?.value).toBe('Example Insurance SA')
  })

  it('leaves counterparty blank when no credible entity or name exists', () => {
    const policy = `Insurance Policy
Insurer: i@company.example
Phone: +41 79 123 45 67
Postal Address: 12 Main Street`
    const extracted = extractContract('policy.pdf', policy)
    expect(extracted.counterparty?.value).toBeUndefined()
  })

  it('does not classify a policy as invoice from monetary text alone', () => {
    const policy = `Service Agreement
Contract Value CHF 1200.00
Start Date: 01/01/2027
Expiry Date: 31/12/2027`
    expect(classifyDocument(policy).type).toBe('contract')
  })
})
