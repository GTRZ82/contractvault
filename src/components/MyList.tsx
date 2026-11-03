import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  isActiveContract,
  isCancellationApproaching,
  isExpiredContract,
  isOverdueInvoice,
  isPaidInvoice,
  isUnpaidInvoice,
  matchesDashboardStatus,
  parseDateParts,
  type DashboardStatusFilter,
} from '../services/dashboardStatus'

interface Contract {
  id: string
  document_type: 'contract' | 'invoice' | null
  document_name: string | null
  contract_name: string | null
  counterparty: string | null
  expiry_date: string | null
  notes: string | null
  storage_path: string | null
  contract_owner: string | null
  contract_value: number | null
  auto_renew: boolean | null
  notice_period: number | null
  invoice_number: string | null
  supplier: string | null
  invoice_date: string | null
  due_date: string | null
  amount_net: number | null
  tax_amount: number | null
  amount_total: number | null
  currency: string | null
  payment_reference: string | null
  payment_status: 'unpaid' | 'paid' | 'overdue' | null
}

function formatDate(date: string): string | null {
  const parts = parseDateParts(date)
  if (!parts) return null

  const day = String(parts.day).padStart(2, '0')
  const month = String(parts.month).padStart(2, '0')
  return `${day}/${month}/${parts.year}`
}

function getInvoiceDisplayStatus(contract: Contract): string | null {
  if (!contract.payment_status) return null
  if (contract.payment_status !== 'unpaid' || !contract.due_date) {
    return contract.payment_status.charAt(0).toUpperCase() + contract.payment_status.slice(1)
  }
  const dueParts = parseDateParts(contract.due_date)
  if (!dueParts) return 'Unpaid'
  const dueDate = new Date(dueParts.year, dueParts.month - 1, dueParts.day)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return dueDate < todayStart ? 'Overdue (past due)' : 'Unpaid'
}

function formatContractValue(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function calculateCancellationDeadline(
  expiryDate: string,
  noticePeriod: number
): { formatted: string; status: 'Safe' | 'Approaching' | 'Urgent' | 'Missed'; color: string } | null {
  const expiryParts = parseDateParts(expiryDate)
  if (!expiryParts || noticePeriod <= 0) return null

  const deadline = new Date(
    expiryParts.year,
    expiryParts.month - 1,
    expiryParts.day
  )
  deadline.setDate(deadline.getDate() - noticePeriod)

  const deadlineYear = deadline.getFullYear()
  const deadlineMonth = deadline.getMonth() + 1
  const deadlineDay = deadline.getDate()
  const formatted = `${String(deadlineDay).padStart(2, '0')}/${String(deadlineMonth).padStart(2, '0')}/${deadlineYear}`

  const today = new Date()
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const deadlineUtc = Date.UTC(deadlineYear, deadlineMonth - 1, deadlineDay)
  const daysUntilDeadline = Math.round((deadlineUtc - todayUtc) / (1000 * 60 * 60 * 24))

  if (daysUntilDeadline < 0) {
    return { formatted, status: 'Missed', color: '#dc2626' }
  }
  if (daysUntilDeadline <= 30) {
    return { formatted, status: 'Urgent', color: '#dc2626' }
  }
  if (daysUntilDeadline <= 90) {
    return { formatted, status: 'Approaching', color: '#d97706' }
  }
  return { formatted, status: 'Safe', color: '#16a34a' }
}

export default function MyList() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [search, setSearch] = useState('')
  const [documentFilter, setDocumentFilter] = useState<'all' | 'contract' | 'invoice'>('all')
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)

  const [editContractName, setEditContractName] =
    useState('')

  const [editCounterparty, setEditCounterparty] =
    useState('')

  const [editExpiryDate, setEditExpiryDate] =
    useState('')

  const [editNotes, setEditNotes] =
    useState('')
    const [editContractOwner, setEditContractOwner] =
  useState('')

const [editContractValue, setEditContractValue] =
  useState('')

const [editAutoRenew, setEditAutoRenew] =
  useState(false)

const [editNoticePeriod, setEditNoticePeriod] =
  useState('')
const [editInvoiceDocumentName, setEditInvoiceDocumentName] = useState('')
const [editSupplier, setEditSupplier] = useState('')
const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
const [editInvoiceDate, setEditInvoiceDate] = useState('')
const [editDueDate, setEditDueDate] = useState('')
const [editAmountNet, setEditAmountNet] = useState('')
const [editTaxAmount, setEditTaxAmount] = useState('')
const [editAmountTotal, setEditAmountTotal] = useState('')
const [editCurrency, setEditCurrency] = useState('CHF')
const [editPaymentReference, setEditPaymentReference] = useState('')
const [editPaymentStatus, setEditPaymentStatus] = useState<'unpaid' | 'paid' | 'overdue'>('unpaid')
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
const [deletingId, setDeletingId] = useState<string | null>(null)
const deletingRef = useRef(false)
const [deleteMessage, setDeleteMessage] = useState('')

  useEffect(() => {
    loadContracts()
  }, [])

  async function loadContracts() {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')

    if (error) {
      console.error(error)
      return
    }

    setContracts(data || [])
  }

  function startEditing(contract: Contract) {
  setEditingId(contract.id)

  setEditContractName(
    contract.contract_name || ''
  )

  setEditCounterparty(
    contract.counterparty || ''
  )

  setEditExpiryDate(
    contract.expiry_date || ''
  )

  setEditNotes(contract.notes || '')

  setEditContractOwner(
    contract.contract_owner || ''
  )

  setEditContractValue(
    contract.contract_value?.toString() || ''
  )

  setEditAutoRenew(
    contract.auto_renew || false
  )

  setEditNoticePeriod(
    contract.notice_period?.toString() || ''
  )

  setEditInvoiceDocumentName(contract.document_name || contract.contract_name || '')
  setEditSupplier(contract.supplier || '')
  setEditInvoiceNumber(contract.invoice_number || '')
  setEditInvoiceDate(contract.invoice_date || '')
  setEditDueDate(contract.due_date || '')
  setEditAmountNet(contract.amount_net?.toString() || '')
  setEditTaxAmount(contract.tax_amount?.toString() || '')
  setEditAmountTotal(contract.amount_total?.toString() || '')
  setEditCurrency(contract.currency || 'CHF')
  setEditPaymentReference(contract.payment_reference || '')
  setEditPaymentStatus(contract.payment_status || 'unpaid')
}

  async function saveContract() {
    if (!editingId || savingRef.current) return

    const editingContract = contracts.find((contract) => contract.id === editingId)
    const isInvoice = editingContract?.document_type === 'invoice'

    if (isInvoice) {
      if (!editInvoiceDocumentName.trim()) {
        alert('Please enter a Document Name.')
        return
      }
      if (!editAmountTotal.trim()) {
        alert('Please enter a Total Amount.')
        return
      }

      for (const [label, value] of [
        ['Net Amount', editAmountNet],
        ['Tax Amount', editTaxAmount],
        ['Total Amount', editAmountTotal],
      ] as const) {
        if (value.trim()) {
          const numberValue = Number(value)
          if (!Number.isFinite(numberValue) || numberValue < 0) {
            alert(`${label} must be a valid number that is 0 or greater.`)
            return
          }
        }
      }

      if (editInvoiceDate && !parseDateParts(editInvoiceDate)) {
        alert('Please enter a valid Invoice Date.')
        return
      }
      if (editDueDate && !parseDateParts(editDueDate)) {
        alert('Please enter a valid Due Date.')
        return
      }
    } else {
      if (!editContractName.trim()) {
        alert('Please enter a Contract Name.')
        return
      }

      if (editContractValue.trim()) {
        const contractValue = Number(editContractValue)
        if (!Number.isFinite(contractValue) || contractValue < 0) {
          alert('Contract Value must be a valid number that is 0 or greater.')
          return
        }
      }

      if (editNoticePeriod.trim()) {
        const noticePeriod = Number(editNoticePeriod)
        if (!Number.isInteger(noticePeriod) || noticePeriod < 0) {
          alert('Notice Period must be a whole number that is 0 or greater.')
          return
        }
      }

      if (editExpiryDate && !parseDateParts(editExpiryDate)) {
        alert('Please enter a valid Expiry Date.')
        return
      }
    }

    savingRef.current = true
    setIsSaving(true)

    try {
      const updates = isInvoice
        ? {
            document_name: editInvoiceDocumentName.trim(),
            supplier: editSupplier || null,
            invoice_number: editInvoiceNumber || null,
            invoice_date: editInvoiceDate || null,
            due_date: editDueDate || null,
            amount_net: editAmountNet ? Number(editAmountNet) : null,
            tax_amount: editTaxAmount ? Number(editTaxAmount) : null,
            amount_total: Number(editAmountTotal),
            currency: editCurrency || 'CHF',
            payment_reference: editPaymentReference || null,
            payment_status: editPaymentStatus,
            notes: editNotes || null,
          }
        : {
            document_name: editContractName.trim(),
            contract_name: editContractName.trim(),
            counterparty: editCounterparty,
            expiry_date: editExpiryDate || null,
            notes: editNotes || null,
            contract_owner: editContractOwner || null,
            contract_value: editContractValue ? Number(editContractValue) : null,
            auto_renew: editAutoRenew,
            notice_period: editNoticePeriod ? Number(editNoticePeriod) : null,
          }

      const { error } = await supabase
        .from('contracts')
        .update(updates)
        .eq('id', editingId)

      if (error) {
        alert(error.message)
        return
      }

      setEditingId(null)
      loadContracts()
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  async function openContract(
    storagePath: string | null
  ) {
    if (!storagePath) {
      alert('No file available')
      return
    }

    const { data, error } = await supabase.storage
      .from('contracts')
      .createSignedUrl(storagePath, 60)

    if (error) {
      alert(error.message)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function deleteContract(
    contractId: string
  ) {
    const confirmed = window.confirm(
      'Delete this contract?'
    )

    if (!confirmed || deletingRef.current) return

    deletingRef.current = true
    setDeletingId(contractId)
    setDeleteMessage('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        setDeleteMessage('Deletion failed: please log in again.')
        return
      }

      const { data: ownedContract, error: fetchError } = await supabase
        .from('contracts')
        .select('id,user_id,storage_path')
        .eq('id', contractId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) {
        setDeleteMessage(`Deletion failed: ${fetchError.message}`)
        return
      }

      if (!ownedContract || ownedContract.user_id !== user.id) {
        setDeleteMessage('Deletion failed: this contract does not belong to your account.')
        return
      }

      const storagePath = ownedContract.storage_path as string | null
      if (storagePath) {
        const userFolderPrefix = `${user.id}/`
        if (!storagePath.startsWith(userFolderPrefix)) {
          setDeleteMessage('Deletion failed: the PDF path is outside your user folder.')
          return
        }

        const { error: storageError } = await supabase.storage
          .from('contracts')
          .remove([storagePath])

        if (storageError) {
          setDeleteMessage(`Deletion failed: PDF could not be deleted. ${storageError.message}`)
          return
        }
      }

      const { error: databaseError } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contractId)
        .eq('user_id', user.id)

      if (databaseError) {
        await loadContracts()
        setDeleteMessage('Warning: the PDF was deleted, but the database record could not be removed.')
        return
      }

      await loadContracts()
      setDeleteMessage('Contract and PDF deleted successfully.')
    } finally {
      deletingRef.current = false
      setDeletingId(null)
    }
  }

  const filteredContracts = contracts.filter(
    (contract) => {
      const txt = search.toLowerCase()
      const isInvoice = contract.document_type === 'invoice'
      if (documentFilter === 'contract' && isInvoice) return false
      if (documentFilter === 'invoice' && !isInvoice) return false
      if (statusFilter && !matchesDashboardStatus(contract, statusFilter)) return false

      if (isInvoice) {
        return (
          (contract.document_name || '')
            .toLowerCase()
            .includes(txt) ||
          (contract.supplier || '')
            .toLowerCase()
            .includes(txt) ||
          (contract.invoice_number || '')
            .toLowerCase()
            .includes(txt) ||
          (contract.payment_reference || '')
            .toLowerCase()
            .includes(txt) ||
          (contract.notes || '')
            .toLowerCase()
            .includes(txt)
        )
      }

      return (
        (contract.document_name || contract.contract_name || '')
          .toLowerCase()
          .includes(txt) ||
        (contract.contract_name || '')
          .toLowerCase()
          .includes(txt) ||
        (contract.counterparty || '')
          .toLowerCase()
          .includes(txt) ||
        (contract.contract_owner || '')
          .toLowerCase()
          .includes(txt) ||
        (contract.notes || '')
          .toLowerCase()
          .includes(txt)
      )
    }
  )

  const activeContracts = contracts.filter((contract) => isActiveContract(contract)).length
  const expiringSoon = contracts.filter((contract) => isCancellationApproaching(contract)).length
  const expiredContracts = contracts.filter((contract) => isExpiredContract(contract)).length
  const unpaidInvoices = contracts.filter((contract) => isUnpaidInvoice(contract)).length
  const paidInvoices = contracts.filter((contract) => isPaidInvoice(contract)).length
  const overdueInvoices = contracts.filter((contract) => isOverdueInvoice(contract)).length

  function selectStatusFilter(
    filter: DashboardStatusFilter,
    documentType: 'contract' | 'invoice',
  ) {
    setSearch('')
    setDocumentFilter(documentType)
    setStatusFilter(filter)
    window.requestAnimationFrame(() => {
      document.getElementById('my-documents-filter')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function clearStatusFilter() {
    setSearch('')
    setStatusFilter(null)
    setDocumentFilter('all')
  }

  return (
    <div>
      <div className="section-heading overview-heading">
        <div>
          <span className="section-kicker">SUMMARY</span>
          <h2 style={{ margin: '3px 0 0', color: '#1e3a5f', fontSize: '21px' }}>Overview</h2>
        </div>
      </div>
      <div
        className="overview-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: '18px',
          marginBottom: '24px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <section className="overview-section" style={{ minWidth: 0, border: '1px solid #e3e8f0', borderRadius: '12px', padding: '14px', background: '#fff', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#1d4ed8', letterSpacing: '0.04em' }}>CONTRACTS</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
            <button type="button" className="metric-card metric-green" aria-label={`Show ${activeContracts} active contracts`} onClick={(event) => { event.preventDefault(); selectStatusFilter('active-contract', 'contract') }} style={{ border: '1px solid #b7dfc3', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#22c55e', fontSize: '32px', margin: 0 }}>{activeContracts}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🟢 Active Contracts</p>
              <span className="metric-card-action">View →</span>
            </button>
            <button type="button" className="metric-card metric-amber" aria-label={`Show ${expiringSoon} contracts with cancellation approaching`} onClick={(event) => { event.preventDefault(); selectStatusFilter('approaching-contract', 'contract') }} style={{ border: '1px solid #ecd39a', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#f59e0b', fontSize: '32px', margin: 0 }}>{expiringSoon}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🟠 Cancellation Approaching</p>
              <span className="metric-card-action">View →</span>
            </button>
            <button type="button" className="metric-card metric-red" aria-label={`Show ${expiredContracts} expired or missed contracts`} onClick={(event) => { event.preventDefault(); selectStatusFilter('expired-contract', 'contract') }} style={{ border: '1px solid #efb8b8', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#ef4444', fontSize: '32px', margin: 0 }}>{expiredContracts}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🔴 Expired / Missed</p>
              <span className="metric-card-action">View →</span>
            </button>
          </div>
        </section>

        <section className="overview-section" style={{ minWidth: 0, border: '1px solid #e3e8f0', borderRadius: '12px', padding: '14px', background: '#fff', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#15803d', letterSpacing: '0.04em' }}>INVOICES</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
            <button type="button" className="metric-card metric-amber" aria-label={`Show ${unpaidInvoices} unpaid invoices`} onClick={(event) => { event.preventDefault(); selectStatusFilter('unpaid-invoice', 'invoice') }} style={{ border: '1px solid #ecd39a', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#d97706', fontSize: '32px', margin: 0 }}>{unpaidInvoices}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🟡 Unpaid Invoices</p>
              <span className="metric-card-action">View →</span>
            </button>
            <button type="button" className="metric-card metric-red" aria-label={`Show ${overdueInvoices} overdue invoices`} onClick={(event) => { event.preventDefault(); selectStatusFilter('overdue-invoice', 'invoice') }} style={{ border: '1px solid #efb8b8', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#dc2626', fontSize: '32px', margin: 0 }}>{overdueInvoices}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🔴 Overdue Invoices</p>
              <span className="metric-card-action">View →</span>
            </button>
            <button type="button" className="metric-card metric-green" aria-label={`Show ${paidInvoices} paid invoices`} onClick={(event) => { event.preventDefault(); selectStatusFilter('paid-invoice', 'invoice') }} style={{ border: '1px solid #b7dfc3', borderRadius: '10px', padding: '12px 8px', minWidth: 0, textAlign: 'center', boxSizing: 'border-box', font: 'inherit', width: '100%' }}>
              <h3 style={{ color: '#16a34a', fontSize: '32px', margin: 0 }}>{paidInvoices}</h3>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.25, overflowWrap: 'anywhere' }}>🟢 Paid Invoices</p>
              <span className="metric-card-action">View →</span>
            </button>
          </div>
        </section>
      </div>

      <div id="my-documents-filter" className="document-toolbar" style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="🔍 Search contracts and invoices..."
          style={{ width: '100%', maxWidth: '520px', boxSizing: 'border-box', padding: '9px 12px' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="document-filter-group" role="group" aria-label="Filter documents">
          {([
            ['all', 'All'],
            ['contract', 'Contracts'],
            ['invoice', 'Invoices'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`document-filter-button${documentFilter === value ? ' active' : ''}`}
              aria-pressed={documentFilter === value}
              onClick={() => {
                setStatusFilter(null)
                setDocumentFilter(value)
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {statusFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
          <strong style={{ color: '#1e3a5f' }}>
            Active filter: {
              statusFilter === 'active-contract' ? 'Active Contracts' :
              statusFilter === 'approaching-contract' ? 'Cancellation Approaching' :
              statusFilter === 'expired-contract' ? 'Expired / Missed' :
              statusFilter === 'unpaid-invoice' ? 'Unpaid Invoices' :
              statusFilter === 'overdue-invoice' ? 'Overdue Invoices' :
              'Paid Invoices'
            }
          </strong>
          <button type="button" className="secondary-action" onClick={clearStatusFilter}>Clear filter</button>
        </div>
      )}

      {deleteMessage && (
        <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>
          {deleteMessage}
        </p>
      )}

      {filteredContracts.length === 0 && (
        <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff', color: '#667085', textAlign: 'center' }}>
          No documents match this filter.
        </div>
      )}

      {filteredContracts.map((contract) => {
        const cancellationDeadline =
          contract.expiry_date &&
          contract.notice_period !== null &&
          contract.notice_period !== undefined
            ? calculateCancellationDeadline(
                contract.expiry_date,
                contract.notice_period
              )
            : null

        return (
        <div
          key={contract.id}
          className="document-card"
          style={{
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            padding: '18px',
            marginBottom: '16px',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06) ',
          }}
        >
          {editingId === contract.id ? (
            contract.document_type === 'invoice' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '5px' }}>Document Name *<input type="text" required value={editInvoiceDocumentName} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} onChange={(e) => setEditInvoiceDocumentName(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Supplier<input type="text" value={editSupplier} style={{ padding: '8px' }} onChange={(e) => setEditSupplier(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Invoice Number<input type="text" value={editInvoiceNumber} style={{ padding: '8px' }} onChange={(e) => setEditInvoiceNumber(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Invoice Date<input type="date" value={editInvoiceDate} style={{ padding: '8px' }} onChange={(e) => setEditInvoiceDate(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Due Date<input type="date" value={editDueDate} style={{ padding: '8px' }} onChange={(e) => setEditDueDate(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Net Amount<input type="number" min="0" step="any" value={editAmountNet} style={{ padding: '8px' }} onChange={(e) => setEditAmountNet(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Tax Amount<input type="number" min="0" step="any" value={editTaxAmount} style={{ padding: '8px' }} onChange={(e) => setEditTaxAmount(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Total Amount *<input type="number" min="0" step="any" required value={editAmountTotal} style={{ padding: '8px' }} onChange={(e) => setEditAmountTotal(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Currency<input type="text" value={editCurrency} style={{ padding: '8px' }} onChange={(e) => setEditCurrency(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Payment Reference<input type="text" value={editPaymentReference} style={{ padding: '8px' }} onChange={(e) => setEditPaymentReference(e.target.value)} /></label>
                <label style={{ display: 'grid', gap: '5px' }}>Payment Status<select value={editPaymentStatus} style={{ padding: '8px' }} onChange={(e) => setEditPaymentStatus(e.target.value as 'unpaid' | 'paid' | 'overdue')}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></label>
                <label style={{ display: 'grid', gap: '5px', gridColumn: '1 / -1' }}>Notes<textarea rows={4} value={editNotes} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px' }} onChange={(e) => setEditNotes(e.target.value)} /></label>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px' }}><button onClick={saveContract} disabled={isSaving} style={{ border: '1px solid #2563eb', borderRadius: '6px', background: '#2563eb', color: '#fff', padding: '8px 14px' }}>{isSaving ? 'Saving...' : 'Save'}</button><button onClick={() => setEditingId(null)} disabled={isSaving} style={{ border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', padding: '8px 14px' }}>Cancel</button></div>
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '5px' }}>Contract Name *
              <input
                type="text"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }}
                required
                value={editContractName}
                onChange={(e) =>
                  setEditContractName(
                    e.target.value
                  )
                }
              />
              </label>

              <label style={{ display: 'grid', gap: '5px' }}>Counterparty
              <input
                style={{ padding: '8px' }}
                type="text"
                value={editCounterparty}
                onChange={(e) =>
                  setEditCounterparty(
                    e.target.value
                  )
                }
              />
              </label>

              <label style={{ display: 'grid', gap: '5px' }}>Expiry Date
              <input
                type="date"
                style={{ padding: '8px' }}
                value={editExpiryDate}
                onChange={(e) =>
                  setEditExpiryDate(
                    e.target.value
                  )
                }
              />
              </label>

<label style={{ display: 'grid', gap: '5px' }}>Contract Owner
<input
  type="text"
  style={{ padding: '8px' }}
  value={editContractOwner}
  onChange={(e) =>
    setEditContractOwner(
      e.target.value
    )
  }
/> </label>

<br />
<br />

<label style={{ display: 'grid', gap: '5px' }}>Contract Value
<input
  type="number"
  style={{ padding: '8px' }}
  min="0"
  step="any"
  value={editContractValue}
  onChange={(e) =>
    setEditContractValue(
      e.target.value
    )
  }
/> </label>

<br />
<br />

<label style={{ display: 'grid', gap: '5px' }}>Notice Period (days)
<input
  type="number"
  style={{ padding: '8px' }}
  min="0"
  step="1"
  value={editNoticePeriod}
  onChange={(e) =>
    setEditNoticePeriod(
      e.target.value
    )
  }
/> </label>

<br />
<br />

<label>
  <input
    type="checkbox"
    checked={editAutoRenew}
    onChange={(e) =>
      setEditAutoRenew(
        e.target.checked
      )
    }
  />
  Auto Renew
</label>

              <label style={{ display: 'grid', gap: '5px', gridColumn: '1 / -1' }}>Notes
                <textarea rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px' }} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px' }}>
                <button onClick={saveContract} disabled={isSaving} style={{ border: '1px solid #2563eb', borderRadius: '6px', background: '#2563eb', color: '#fff', padding: '8px 14px' }}>{isSaving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditingId(null)} disabled={isSaving} style={{ border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', padding: '8px 14px' }}>Cancel</button>
              </div>
            </div>
            )
          ) : (
            <>
              {contract.document_type === 'invoice' ? (
                <>
                  <h3 className="document-card-title document-card-title-primary" style={{ margin: '0 0 10px 0' }}>🧾 <span>{contract.document_name || contract.contract_name || 'Unnamed invoice'}</span></h3>
                  <div className="document-card-details document-card-invoice" style={{ lineHeight: 1.6 }}>
                    {contract.supplier?.trim() && <p className="document-primary-field"><strong>Supplier:</strong> {contract.supplier}</p>}
                    {contract.payment_status && (() => {
                      const displayStatus = getInvoiceDisplayStatus(contract)
                      const badgeClass = displayStatus?.startsWith('Overdue') || contract.payment_status === 'overdue' ? 'badge-red' : contract.payment_status === 'paid' ? 'badge-green' : 'badge-amber'
                      return <p className="document-primary-field"><strong>Payment Status:</strong> <span className={`status-badge ${badgeClass}`}>{displayStatus}</span></p>
                    })()}
                    {contract.amount_total !== null && contract.amount_total !== undefined && <p className="document-primary-field"><strong>Total Amount:</strong> {contract.currency || 'CHF'} {formatContractValue(contract.amount_total)}</p>}
                    {contract.due_date && formatDate(contract.due_date) && <p className="document-primary-field"><strong>Due Date:</strong> {formatDate(contract.due_date)}</p>}
                    {contract.invoice_number?.trim() && <p className="document-primary-field"><strong>Invoice Number:</strong> {contract.invoice_number}</p>}
                    {contract.invoice_date && formatDate(contract.invoice_date) && <p className="document-secondary-field"><strong>Invoice Date:</strong> {formatDate(contract.invoice_date)}</p>}
                    {contract.amount_net !== null && contract.amount_net !== undefined && <p className="document-secondary-field"><strong>Net Amount:</strong> {contract.currency || 'CHF'} {formatContractValue(contract.amount_net)}</p>}
                    {contract.tax_amount !== null && contract.tax_amount !== undefined && <p className="document-secondary-field"><strong>Tax Amount:</strong> {contract.currency || 'CHF'} {formatContractValue(contract.tax_amount)}</p>}
                    {contract.currency?.trim() && <p className="document-secondary-field"><strong>Currency:</strong> {contract.currency}</p>}
                    {contract.payment_reference?.trim() && <p className="document-secondary-field"><strong>Payment Reference:</strong> {contract.payment_reference}</p>}
                    {contract.notes?.trim() && <p className="document-secondary-field"><strong>Notes:</strong> {contract.notes}</p>}
                  </div>
                </>
              ) : (
                <>
              <h3 className="document-card-title document-card-title-primary" style={{ margin: '0 0 10px 0' }}>
                📄 <span>{contract.document_name || contract.contract_name}</span>
              </h3>

              <div className="document-card-details document-card-contract" style={{ lineHeight: 1.6 }}>
                {contract.counterparty?.trim() && <p className="document-primary-field"><strong>Counterparty:</strong> {contract.counterparty}</p>}
                {cancellationDeadline && <p className="document-primary-field"><strong>Deadline Status:</strong> <span className={`status-badge ${cancellationDeadline.status === 'Safe' ? 'badge-green' : cancellationDeadline.status === 'Approaching' ? 'badge-amber' : 'badge-red'}`}>{cancellationDeadline.status === 'Missed' ? 'Expired / Missed' : cancellationDeadline.status}</span></p>}
                {contract.expiry_date && formatDate(contract.expiry_date) && <p className="document-primary-field"><strong>Expiry Date:</strong> {formatDate(contract.expiry_date)}</p>}
                {cancellationDeadline && <p className="document-primary-field"><strong>Cancellation Deadline:</strong> {cancellationDeadline.formatted}</p>}
                {contract.contract_value !== null && contract.contract_value !== undefined && <p className="document-primary-field"><strong>Contract Value:</strong> CHF {formatContractValue(contract.contract_value)}</p>}
                {contract.contract_owner?.trim() && <p className="document-secondary-field"><strong>Contract Owner:</strong> {contract.contract_owner}</p>}
                {contract.auto_renew !== null && contract.auto_renew !== undefined && <p className="document-secondary-field"><strong>Auto Renew:</strong> {contract.auto_renew ? 'Yes' : 'No'}</p>}
                {contract.notice_period !== null && contract.notice_period !== undefined && contract.notice_period > 0 && <p className="document-secondary-field"><strong>Notice Period:</strong> {contract.notice_period} days</p>}
                {contract.notes?.trim() && <p className="document-secondary-field"><strong>Notes:</strong> {contract.notes}</p>}
              </div>
                </>
              )}

              <div
                className="document-card-actions"
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginTop: '10px',
                }}
              >
                <button
                  onClick={() => openContract(contract.storage_path)}
                  style={{ border: '1px solid #2563eb', borderRadius: '6px', background: '#fff', color: '#1d4ed8', padding: '8px 12px', cursor: 'pointer' }}
                >Open PDF</button>

                <button
                  onClick={() => startEditing(contract)}
                  style={{ border: '1px solid #d1d5db', borderRadius: '6px', background: '#f9fafb', color: '#374151', padding: '8px 12px', cursor: 'pointer' }}
                >Edit</button>

                <button
                  onClick={() => deleteContract(contract.id)}
                  disabled={deletingId !== null}
                  style={{ border: '1px solid #dc2626', borderRadius: '6px', background: '#dc2626', color: '#fff', padding: '8px 12px', cursor: deletingId !== null ? 'wait' : 'pointer' }}
                >{deletingId === contract.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </>
          )}
        </div>
        )
      })}
    </div>
  )
}