import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export interface ExtractedField<T = string> {
  value?: T
  confidence: number
  reviewRequired?: boolean
}

export interface InvoiceExtraction {
  documentName?: ExtractedField<string>
  supplier?: ExtractedField<string>
  invoiceNumber?: ExtractedField<string>
  invoiceDate?: ExtractedField<string>
  dueDate?: ExtractedField<string>
  netAmount?: ExtractedField<string>
  taxAmount?: ExtractedField<string>
  totalAmount?: ExtractedField<string>
  currency?: ExtractedField<string>
  paymentReference?: ExtractedField<string>
  paymentStatus?: ExtractedField<'unpaid' | 'paid' | 'overdue'>
  notes?: ExtractedField<string>
}

export interface ContractExtraction {
  documentName?: ExtractedField<string>
  counterparty?: ExtractedField<string>
  contractOwner?: ExtractedField<string>
  startDate?: ExtractedField<string>
  expiryDate?: ExtractedField<string>
  contractValue?: ExtractedField<string>
  currency?: ExtractedField<string>
  autoRenew?: ExtractedField<boolean>
  noticePeriod?: ExtractedField<string>
}

export async function extractPdfText(file: File): Promise<{ text: string; pageTexts: string[] }> {
  const buffer = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pageTexts.push(pageText)
  }

  return { text: pageTexts.join('\n\n--- PAGE BREAK ---\n\n'), pageTexts }
}
