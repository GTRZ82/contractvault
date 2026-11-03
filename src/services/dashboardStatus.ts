export type DashboardContract = {
  document_type: 'contract' | 'invoice' | null
  expiry_date?: string | null
  due_date?: string | null
  payment_status?: 'unpaid' | 'paid' | 'overdue' | null
}

export function parseDateParts(date: string): { year: number; month: number; day: number } | null {
  const parts = date.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/)
  if (!parts) return null

  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const parsed = new Date(year, month - 1, day)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function isActiveContract(contract: DashboardContract, today = new Date()) {
  if (contract.document_type === 'invoice') return false
  if (!contract.expiry_date) return true
  const expiryParts = parseDateParts(contract.expiry_date)
  if (!expiryParts) return false
  const expiry = new Date(expiryParts.year, expiryParts.month - 1, expiryParts.day)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return expiry > todayStart
}

export function isCancellationApproaching(contract: DashboardContract, today = new Date()) {
  if (contract.document_type === 'invoice' || !contract.expiry_date) return false
  const expiryParts = parseDateParts(contract.expiry_date)
  if (!expiryParts) return false
  const expiry = new Date(expiryParts.year, expiryParts.month - 1, expiryParts.day)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.ceil((expiry.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
  return days > 0 && days <= 30
}

export function isExpiredContract(contract: DashboardContract, today = new Date()) {
  if (contract.document_type === 'invoice' || !contract.expiry_date) return false
  const expiryParts = parseDateParts(contract.expiry_date)
  if (!expiryParts) return false
  const expiry = new Date(expiryParts.year, expiryParts.month - 1, expiryParts.day)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return expiry <= todayStart
}

export function isOverdueInvoice(contract: DashboardContract, today = new Date()) {
  if (contract.document_type !== 'invoice') return false
  if (contract.payment_status === 'overdue') return true
  if (contract.payment_status !== 'unpaid' || !contract.due_date) return false

  const dueParts = parseDateParts(contract.due_date)
  if (!dueParts) return false

  const dueDate = new Date(dueParts.year, dueParts.month - 1, dueParts.day)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return dueDate < todayStart
}

export function isUnpaidInvoice(contract: DashboardContract, today = new Date()) {
  return contract.document_type === 'invoice'
    && contract.payment_status === 'unpaid'
    && !isOverdueInvoice(contract, today)
}

export function isPaidInvoice(contract: DashboardContract) {
  return contract.document_type === 'invoice' && contract.payment_status === 'paid'
}

export type DashboardStatusFilter =
  | 'active-contract'
  | 'approaching-contract'
  | 'expired-contract'
  | 'unpaid-invoice'
  | 'overdue-invoice'
  | 'paid-invoice'

export function matchesDashboardStatus(
  contract: DashboardContract,
  statusFilter: DashboardStatusFilter,
  today = new Date(),
) {
  if (statusFilter === 'active-contract') return isActiveContract(contract, today)
  if (statusFilter === 'approaching-contract') return isCancellationApproaching(contract, today)
  if (statusFilter === 'expired-contract') return isExpiredContract(contract, today)
  if (statusFilter === 'unpaid-invoice') return isUnpaidInvoice(contract, today)
  if (statusFilter === 'overdue-invoice') return isOverdueInvoice(contract, today)
  return isPaidInvoice(contract)
}

export function filterDocumentsByDashboardStatus<T extends DashboardContract>(
  documents: T[],
  statusFilter: DashboardStatusFilter,
  today = new Date(),
) {
  return documents.filter((document) => matchesDashboardStatus(document, statusFilter, today))
}
