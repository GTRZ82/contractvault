import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Contract {
  id: string
  file_name: string
  storage_path: string | null
  contract_name: string
  expiry_date: string | null
  notes: string | null
}

export default function MyList() {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    loadContracts()
  }, [])

  async function loadContracts() {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .order('expiry_date', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    setContracts(data || [])
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return ''

    return new Date(dateString).toLocaleDateString('de-CH')
  }

  function getDaysRemaining(dateString: string | null) {
    if (!dateString) return 9999

    const today = new Date()
    const expiry = new Date(dateString)

    const difference =
      expiry.getTime() - today.getTime()

    return Math.ceil(
      difference / (1000 * 60 * 60 * 24)
    )
  }

  function getBorderColor(dateString: string | null) {
    const days = getDaysRemaining(dateString)

    if (days <= 30) return '#ef4444'
    if (days <= 90) return '#f59e0b'

    return '#22c55e'
  }

  function getStatusText(dateString: string | null) {
    const days = getDaysRemaining(dateString)

    if (days <= 0) return '🔴 Expired'
    if (days <= 30) return `🔴 ${days} days remaining`
    if (days <= 90) return `🟠 ${days} days remaining`

    return `🟢 ${days} days remaining`
  }

  async function openContract(
    storagePath: string | null
  ) {
    if (!storagePath) {
      alert(
        'This contract was uploaded before storage tracking was added.'
      )
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

    if (!confirmed) return

    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', contractId)

    if (error) {
      alert(error.message)
      return
    }

    loadContracts()
  }

  const activeContracts = contracts.filter(
    contract => getDaysRemaining(contract.expiry_date) > 0
  ).length

  const expiringSoon = contracts.filter(
    contract => {
      const days = getDaysRemaining(
        contract.expiry_date
      )

      return days > 0 && days <= 30
    }
  ).length

  const expiredContracts = contracts.filter(
    contract => getDaysRemaining(contract.expiry_date) <= 0
  ).length

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '25px',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3>{activeContracts}</h3>
          <p>Active Contracts</p>
        </div>

        <div
          style={{
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3>{expiringSoon}</h3>
          <p>Expiring in 30 Days</p>
        </div>

        <div
          style={{
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3>{expiredContracts}</h3>
          <p>Expired</p>
        </div>
      </div>

      {contracts.length === 0 ? (
        <p>No contracts uploaded yet</p>
      ) : (
        contracts.map((contract) => (
          <div
            key={contract.id}
            style={{
              border: `3px solid ${getBorderColor(
                contract.expiry_date
              )}`,
              borderRadius: '10px',
              padding: '15px',
              marginBottom: '15px',
            }}
          >
            <h3>
              📄 {contract.contract_name}
            </h3>

            {contract.expiry_date && (
              <>
                <p>
                  📅 Expiry Date:{' '}
                  {formatDate(
                    contract.expiry_date
                  )}
                </p>

                <p>
                  {getStatusText(
                    contract.expiry_date
                  )}
                </p>
              </>
            )}

            {contract.notes && (
              <p>
                📝 {contract.notes}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '10px',
              }}
            >
              <button
                onClick={() =>
                  openContract(
                    contract.storage_path
                  )
                }
              >
                Open PDF
              </button>

              <button
                onClick={() =>
                  deleteContract(contract.id)
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}