import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { extractPdfText, type ExtractedField } from '../services/extraction/pdfText'
import { classifyDocument, resolveDocumentType } from '../services/extraction/documentClassifier'
import { extractInvoice } from '../services/extraction/invoiceExtractor'
import { extractContract } from '../services/extraction/contractExtractor'

function isValidDate(date: string): boolean {
  const parts = date.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/)
  if (!parts) return false
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

type UploadContractProps = {
  onDocumentSaved?: () => void
  onCancel?: () => void
}

export default function UploadContract({ onDocumentSaved, onCancel }: UploadContractProps) {
  const [message, setMessage] = useState('')
  const [contractName, setContractName] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [startDate, setStartDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [documentType, setDocumentType] = useState<'contract' | 'invoice'>('contract')
  const [invoiceDocumentName, setInvoiceDocumentName] = useState('')
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [amountNet, setAmountNet] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [amountTotal, setAmountTotal] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid' | 'overdue'>('unpaid')
  const [contractOwner, setContractOwner] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [autoRenew, setAutoRenew] = useState(false)
  const [noticePeriodDays, setNoticePeriodDays] = useState('')
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [extractionBanner, setExtractionBanner] = useState('')
  const [lowConfidenceFields, setLowConfidenceFields] = useState<Set<string>>(new Set())
  const [extractedFields, setExtractedFields] = useState<Set<string>>(new Set())
  const [classificationUncertain, setClassificationUncertain] = useState(false)
  const savingRef = useRef(false)
  const explicitlySelectedDocumentTypeRef = useRef<'contract' | 'invoice' | null>(null)
  const extractedTextRef = useRef('')
  const extractedFileNameRef = useRef('')

  function fieldStyle(field: string): React.CSSProperties {
    if (lowConfidenceFields.has(field)) return { border: '2px solid #d97706', backgroundColor: '#fffbeb' }
    if (extractedFields.has(field)) return { border: '2px solid #16a34a', backgroundColor: '#f0fdf4' }
    return {}
  }

  function markField(field: string, extracted: ExtractedField | undefined, targetFields: Set<string>, lowFields: Set<string>, valueSetter?: (value: string) => void) {
    if (!extracted || extracted.confidence < 0.7 || extracted.value === undefined || extracted.value === null) return
    if (valueSetter) valueSetter(String(extracted.value))
    targetFields.add(field)
    if (extracted.confidence < 0.9 || extracted.reviewRequired) lowFields.add(field)
  }

  function applyInvoiceExtraction(text: string, fileName: string) {
    const extracted = new Set<string>()
    const low = new Set<string>()

    setInvoiceDocumentName('')
    setSupplier('')
    setInvoiceNumber('')
    setInvoiceDate('')
    setDueDate('')
    setAmountNet('')
    setTaxAmount('')
    setAmountTotal('')
    setCurrency('')
    setPaymentReference('')
    setPaymentStatus('unpaid')

    const invoice = extractInvoice(fileName, text)
    markField('invoiceDocumentName', invoice.documentName, extracted, low, setInvoiceDocumentName)
    markField('supplier', invoice.supplier, extracted, low, setSupplier)
    markField('invoiceNumber', invoice.invoiceNumber, extracted, low, setInvoiceNumber)
    markField('invoiceDate', invoice.invoiceDate, extracted, low, setInvoiceDate)
    markField('dueDate', invoice.dueDate, extracted, low, setDueDate)
    markField('amountNet', invoice.netAmount, extracted, low, setAmountNet)
    markField('taxAmount', invoice.taxAmount, extracted, low, setTaxAmount)
    markField('amountTotal', invoice.totalAmount, extracted, low, setAmountTotal)
    markField('currency', invoice.currency, extracted, low, setCurrency)
    markField('paymentReference', invoice.paymentReference, extracted, low, setPaymentReference)
    if (invoice.paymentStatus?.value && invoice.paymentStatus.confidence >= 0.7) {
      setPaymentStatus(invoice.paymentStatus.value)
      extracted.add('paymentStatus')
      if (invoice.paymentStatus.confidence < 0.9 || invoice.paymentStatus.reviewRequired) low.add('paymentStatus')
    }

    setExtractedFields(extracted)
    setLowConfidenceFields(low)
  }

  function applyContractExtraction(text: string, fileName: string) {
    const extracted = new Set<string>()
    const low = new Set<string>()

    setContractName('')
    setCounterparty('')
    setContractOwner('')
    setContractValue('')
    setCurrency('')
    setStartDate('')
    setExpiryDate('')
    setAutoRenew(false)
    setNoticePeriodDays('')

    const contract = extractContract(fileName, text)
    markField('contractName', contract.documentName, extracted, low, setContractName)
    markField('counterparty', contract.counterparty, extracted, low, setCounterparty)
    markField('contractOwner', contract.contractOwner, extracted, low, setContractOwner)
    markField('startDate', contract.startDate, extracted, low, setStartDate)
    markField('expiryDate', contract.expiryDate, extracted, low, setExpiryDate)
    markField('contractValue', contract.contractValue, extracted, low, setContractValue)
    markField('currency', contract.currency, extracted, low, setCurrency)
    markField('noticePeriod', contract.noticePeriod, extracted, low, setNoticePeriodDays)
    if (contract.autoRenew?.value !== undefined && contract.autoRenew.confidence >= 0.7) {
      setAutoRenew(contract.autoRenew.value)
      extracted.add('autoRenew')
      if (contract.autoRenew.confidence < 0.9 || contract.autoRenew.reviewRequired) low.add('autoRenew')
    }

    setExtractedFields(extracted)
    setLowConfidenceFields(low)
  }

  function handleDocumentTypeChange(type: 'contract' | 'invoice') {
    explicitlySelectedDocumentTypeRef.current = type
    setDocumentType(type)
    if (!classificationUncertain || !extractedTextRef.current) return

    if (type === 'invoice') {
      applyInvoiceExtraction(extractedTextRef.current, extractedFileNameRef.current)
    } else {
      applyContractExtraction(extractedTextRef.current, extractedFileNameRef.current)
    }

    setClassificationUncertain(false)
    setExtractionBanner('Document type confirmed - please review extracted values before saving')
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || savingRef.current) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Please select a PDF file.')
      event.target.value = ''
      return
    }

    setSelectedPdf(file)
    extractedTextRef.current = ''
    extractedFileNameRef.current = file.name
    setClassificationUncertain(false)
    setIsExtracting(true)
    setMessage('')
    setExtractionBanner('')

    try {
      const { text } = await extractPdfText(file)
      if (text.replace(/--- PAGE BREAK ---/g, '').replace(/\s/g, '').length < 40) {
        setMessage('No readable text was found in this PDF. Manual entry or OCR is required.')
        setExtractionBanner('')
        return
      }

      extractedTextRef.current = text

      const classification = classifyDocument(text)
      const selectedType = resolveDocumentType(
        classification.type,
        explicitlySelectedDocumentTypeRef.current,
      )

      if (!explicitlySelectedDocumentTypeRef.current) {
        setDocumentType(selectedType)
      }

      if (!explicitlySelectedDocumentTypeRef.current && classification.confidence < 0.7) {
        setClassificationUncertain(true)
        setExtractionBanner('Document type is uncertain - please confirm Contract or Invoice before saving')
      } else {
        setClassificationUncertain(false)
      }

      if (selectedType === 'invoice') {
        applyInvoiceExtraction(text, file.name)
      } else {
        applyContractExtraction(text, file.name)
      }
      setExtractionBanner(
        !explicitlySelectedDocumentTypeRef.current && classification.confidence < 0.7
          ? 'Document type is uncertain - please confirm Contract or Invoice; review extracted values before saving'
          : 'Extracted from PDF - please review before saving',
      )
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'PDF extraction failed')
      setMessage('Could not read this PDF. Please enter the details manually.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function saveDocument() {
    if (!selectedPdf || savingRef.current) {
      if (!selectedPdf) setMessage('Please select a PDF before saving.')
      return
    }

    if (documentType === 'contract') {
      if (!contractName.trim()) { setMessage('Please enter a Contract Name.'); return }
      if (contractValue.trim() && (!Number.isFinite(Number(contractValue)) || Number(contractValue) < 0)) { setMessage('Contract Value must be a valid number that is 0 or greater.'); return }
      if (noticePeriodDays.trim() && (!Number.isInteger(Number(noticePeriodDays)) || Number(noticePeriodDays) < 0)) { setMessage('Notice Period must be a whole number that is 0 or greater.'); return }
      if (startDate && !isValidDate(startDate)) { setMessage('Please enter a valid Start Date.'); return }
      if (expiryDate && !isValidDate(expiryDate)) { setMessage('Please enter a valid Expiry Date.'); return }
    } else {
      if (!invoiceDocumentName.trim()) { setMessage('Please enter a Document Name.'); return }
      if (!amountTotal.trim()) { setMessage('Please enter a Total Amount.'); return }
      for (const [label, value] of [['Net Amount', amountNet], ['Tax Amount', taxAmount], ['Total Amount', amountTotal]] as const) {
        if (value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0)) { setMessage(`${label} must be a valid number that is 0 or greater.`); return }
      }
      if (invoiceDate && !isValidDate(invoiceDate)) { setMessage('Please enter a valid Invoice Date.'); return }
      if (dueDate && !isValidDate(dueDate)) { setMessage('Please enter a valid Due Date.'); return }
    }

    savingRef.current = true
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setMessage('Please login first'); return }
      const filePath = `${user.id}/${Date.now()}-${selectedPdf.name}`
      const { error: uploadError } = await supabase.storage.from('contracts').upload(filePath, selectedPdf)
      if (uploadError) { setMessage(uploadError.message); return }

      const record = documentType === 'contract'
        ? {
            user_id: user.id, storage_path: filePath, document_type: 'contract',
            document_name: contractName.trim(), contract_name: contractName.trim(),
            counterparty: counterparty || null, contract_owner: contractOwner || null,
            contract_value: contractValue ? Number(contractValue) : null,
            currency: currency || null, start_date: startDate || null, expiry_date: expiryDate || null,
            auto_renew: autoRenew, notice_period: noticePeriodDays ? Number(noticePeriodDays) : null, notes: notes || null,
          }
        : {
            user_id: user.id, storage_path: filePath, document_type: 'invoice',
            document_name: invoiceDocumentName.trim(), supplier: supplier || null,
            invoice_number: invoiceNumber || null, invoice_date: invoiceDate || null, due_date: dueDate || null,
            amount_net: amountNet ? Number(amountNet) : null, tax_amount: taxAmount ? Number(taxAmount) : null,
            amount_total: Number(amountTotal), currency: currency || 'CHF', payment_reference: paymentReference || null,
            payment_status: paymentStatus, notes: notes || null,
          }

      const { error: dbError } = await supabase.from('contracts').insert([record])
      if (dbError) { await supabase.storage.from('contracts').remove([filePath]); setMessage(dbError.message); return }

      setSelectedPdf(null)
      setContractName(''); setCounterparty(''); setStartDate(''); setExpiryDate(''); setContractOwner(''); setContractValue(''); setAutoRenew(false); setNoticePeriodDays(''); setNotes('')
      setInvoiceDocumentName(''); setSupplier(''); setInvoiceNumber(''); setInvoiceDate(''); setDueDate(''); setAmountNet(''); setTaxAmount(''); setAmountTotal(''); setCurrency('CHF'); setPaymentReference(''); setPaymentStatus('unpaid')
      setExtractedFields(new Set()); setLowConfidenceFields(new Set()); setExtractionBanner('')
      setMessage(documentType === 'contract' ? 'Contract uploaded successfully' : 'Invoice uploaded successfully')
      onDocumentSaved?.()
    } catch {
      setMessage('Upload failed')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <div className="upload-shell" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', background: '#fff' }}>
      <fieldset className="document-type-selector" style={{ border: '1px solid #d1d5db', borderRadius: '8px', margin: '0 0 18px 0', padding: '12px 14px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 700 }}>What are you uploading?</legend>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '12px', padding: '10px 12px', borderRadius: '8px', background: documentType === 'contract' ? '#eef4fb' : '#fff', border: documentType === 'contract' ? '1px solid #1e3a5f' : '1px solid #dbe3ef' }}><input type="radio" checked={documentType === 'contract'} onChange={() => handleDocumentTypeChange('contract')} /> 📄 Contract</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderRadius: '8px', background: documentType === 'invoice' ? '#eef4fb' : '#fff', border: documentType === 'invoice' ? '1px solid #1e3a5f' : '1px solid #dbe3ef' }}><input type="radio" checked={documentType === 'invoice'} onChange={() => handleDocumentTypeChange('invoice')} /> 🧾 Invoice</label>
      </fieldset>

      {extractionBanner && <div style={{ padding: '12px', border: '1px solid #16a34a', background: '#f0fdf4', borderRadius: '8px', marginBottom: '16px' }}><p style={{ fontWeight: 'bold', margin: '0 0 6px 0' }}>{extractionBanner}</p><small>Green = extracted with high confidence; Amber = review required; Blank = not identified.</small></div>}

      {documentType === 'contract' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '5px' }}>Contract Name *<input type="text" required value={contractName} style={{ ...fieldStyle('contractName'), width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px' }} onChange={(e) => setContractName(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Counterparty<input type="text" value={counterparty} style={{ ...fieldStyle('counterparty'), width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px' }} onChange={(e) => setCounterparty(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Contract Owner<input type="text" value={contractOwner} style={{ ...fieldStyle('contractOwner'), padding: '8px' }} onChange={(e) => setContractOwner(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Contract Value<input type="number" min="0" step="any" value={contractValue} style={{ ...fieldStyle('contractValue'), padding: '8px' }} onChange={(e) => setContractValue(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Currency<input type="text" value={currency} style={{ ...fieldStyle('currency'), padding: '8px' }} onChange={(e) => setCurrency(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Start Date<input type="date" value={startDate} style={{ ...fieldStyle('startDate'), padding: '8px' }} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Expiry Date<input type="date" value={expiryDate} style={{ ...fieldStyle('expiryDate'), padding: '8px' }} onChange={(e) => setExpiryDate(e.target.value)} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '58px' }}><input type="checkbox" checked={autoRenew} style={fieldStyle('autoRenew')} onChange={(e) => setAutoRenew(e.target.checked)} /> Auto Renew</label>
          <label style={{ display: 'grid', gap: '5px' }}>Notice Period (days)<input type="number" min="0" step="1" value={noticePeriodDays} style={{ ...fieldStyle('noticePeriod'), padding: '8px' }} onChange={(e) => setNoticePeriodDays(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px', gridColumn: '1 / -1' }}>Notes<textarea value={notes} rows={4} style={{ boxSizing: 'border-box', width: '100%', resize: 'vertical', padding: '8px' }} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '5px' }}>Document Name *<input type="text" required value={invoiceDocumentName} style={{ ...fieldStyle('invoiceDocumentName'), width: '100%', boxSizing: 'border-box', padding: '8px' }} onChange={(e) => setInvoiceDocumentName(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Supplier<input type="text" value={supplier} style={{ ...fieldStyle('supplier'), padding: '8px' }} onChange={(e) => setSupplier(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Invoice Number<input type="text" value={invoiceNumber} style={{ ...fieldStyle('invoiceNumber'), padding: '8px' }} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Invoice Date<input type="date" value={invoiceDate} style={{ ...fieldStyle('invoiceDate'), padding: '8px' }} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Due Date<input type="date" value={dueDate} style={{ ...fieldStyle('dueDate'), padding: '8px' }} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Net Amount<input type="number" min="0" step="any" value={amountNet} style={{ ...fieldStyle('amountNet'), padding: '8px' }} onChange={(e) => setAmountNet(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Tax Amount<input type="number" min="0" step="any" value={taxAmount} style={{ ...fieldStyle('taxAmount'), padding: '8px' }} onChange={(e) => setTaxAmount(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Total Amount *<input type="number" min="0" step="any" required value={amountTotal} style={{ ...fieldStyle('amountTotal'), padding: '8px' }} onChange={(e) => setAmountTotal(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Currency<input type="text" value={currency} style={{ ...fieldStyle('currency'), padding: '8px' }} onChange={(e) => setCurrency(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Payment Reference<input type="text" value={paymentReference} style={{ ...fieldStyle('paymentReference'), padding: '8px' }} onChange={(e) => setPaymentReference(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: '5px' }}>Payment Status<select value={paymentStatus} style={{ ...fieldStyle('paymentStatus'), padding: '8px' }} onChange={(e) => setPaymentStatus(e.target.value as 'unpaid' | 'paid' | 'overdue')}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></label>
          <label style={{ display: 'grid', gap: '5px', gridColumn: '1 / -1' }}>Notes<textarea value={notes} rows={4} style={{ boxSizing: 'border-box', width: '100%', resize: 'vertical', padding: '8px' }} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      )}

      <div style={{ marginTop: '18px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
        <label style={{ display: 'grid', gap: '5px', maxWidth: '500px', marginBottom: '12px' }}>PDF file *<input type="file" accept=".pdf,application/pdf" disabled={isSaving || isExtracting} onChange={handleFileChange} /></label>
        {isExtracting && <p style={{ margin: '0 0 10px 0', color: '#2563eb', fontWeight: 600 }}>Extracting PDF...</p>}
        <div className="upload-actions">
          {selectedPdf && <button type="button" className="upload-save-button" onClick={saveDocument} disabled={isSaving || isExtracting}>{isSaving ? 'Uploading...' : 'Upload / Save'}</button>}
          <button type="button" className="upload-cancel-button" onClick={onCancel} disabled={isSaving || isExtracting}>Cancel</button>
        </div>
      </div>
      <p>{message}</p>
    </div>
  )
}
