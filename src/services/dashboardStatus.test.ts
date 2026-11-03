import { describe, expect, it } from 'vitest'
import {
  filterDocumentsByDashboardStatus,
  isActiveContract,
  isCancellationApproaching,
  isExpiredContract,
  isOverdueInvoice,
  isPaidInvoice,
  isUnpaidInvoice,
} from './dashboardStatus'

const today = new Date(2026, 10, 3)

describe('dashboard contract status predicates', () => {
  it('matches active contracts without an expiry date', () => {
    expect(isActiveContract({ document_type: 'contract', expiry_date: null }, today)).toBe(true)
  })

  it('matches contracts expiring within 30 days', () => {
    expect(isCancellationApproaching({ document_type: 'contract', expiry_date: '2026-11-20' }, today)).toBe(true)
  })

  it('does not classify an expired contract as approaching', () => {
    expect(isCancellationApproaching({ document_type: 'contract', expiry_date: '2026-11-01' }, today)).toBe(false)
  })

  it('matches contracts with an expiry on or before today as expired', () => {
    expect(isExpiredContract({ document_type: 'contract', expiry_date: '2026-11-03' }, today)).toBe(true)
  })
})

describe('dashboard invoice status predicates', () => {
  it('keeps overdue invoices out of unpaid invoices', () => {
    const invoice = { document_type: 'invoice' as const, payment_status: 'unpaid' as const, due_date: '2026-11-01' }
    expect(isOverdueInvoice(invoice, today)).toBe(true)
    expect(isUnpaidInvoice(invoice, today)).toBe(false)
  })

  it('classifies unpaid invoices with future or missing due dates as unpaid', () => {
    expect(isUnpaidInvoice({ document_type: 'invoice', payment_status: 'unpaid', due_date: '2026-11-30' }, today)).toBe(true)
    expect(isUnpaidInvoice({ document_type: 'invoice', payment_status: 'unpaid', due_date: null }, today)).toBe(true)
  })

  it('classifies explicitly overdue and paid invoices separately', () => {
    expect(isOverdueInvoice({ document_type: 'invoice', payment_status: 'overdue', due_date: null }, today)).toBe(true)
    expect(isPaidInvoice({ document_type: 'invoice', payment_status: 'paid', due_date: null })).toBe(true)
    expect(isUnpaidInvoice({ document_type: 'invoice', payment_status: 'paid', due_date: null }, today)).toBe(false)
  })
})

describe('dashboard card navigation filtering', () => {
  const documents: Array<{
    id: string
    document_type: 'contract' | 'invoice' | null
    expiry_date: string | null
    due_date: string | null
    payment_status?: 'unpaid' | 'paid' | 'overdue' | null
  }> = [
    { id: 'active-1', document_type: 'contract' as const, expiry_date: '2026-12-31', due_date: null },
    { id: 'active-2', document_type: null, expiry_date: null, due_date: null },
    { id: 'expired-1', document_type: 'contract', expiry_date: '2026-11-01', due_date: null },
    { id: 'unpaid-1', document_type: 'invoice' as const, payment_status: 'unpaid' as const, expiry_date: null, due_date: '2026-12-01' },
    { id: 'overdue-1', document_type: 'invoice' as const, payment_status: 'unpaid' as const, expiry_date: null, due_date: '2026-11-01' },
    { id: 'paid-1', document_type: 'invoice' as const, payment_status: 'paid' as const, expiry_date: null, due_date: null },
  ]

  it('changes the displayed active-contract list through the shared card filter path', () => {
    const result = filterDocumentsByDashboardStatus(documents, 'active-contract', today)
    expect(result.map((document) => document.id)).toEqual(['active-1', 'active-2'])
  })

  it('filters unpaid, overdue, and paid card selections to their matching lists', () => {
    expect(filterDocumentsByDashboardStatus(documents, 'unpaid-invoice', today).map((document) => document.id)).toEqual(['unpaid-1'])
    expect(filterDocumentsByDashboardStatus(documents, 'overdue-invoice', today).map((document) => document.id)).toEqual(['overdue-1'])
    expect(filterDocumentsByDashboardStatus(documents, 'paid-invoice', today).map((document) => document.id)).toEqual(['paid-1'])
  })

  it('returns an empty filtered list when the paid-card count is zero', () => {
    const noPaidDocuments = documents.filter((document) => document.id !== 'paid-1')
    expect(filterDocumentsByDashboardStatus(noPaidDocuments, 'paid-invoice', today)).toEqual([])
  })
})
