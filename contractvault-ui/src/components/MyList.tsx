import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Contract {
  id: string
  contract_name: string
  counterparty: string | null
  expiry_date: string | null
  notes: string | null
  storage_path: string | null
}

export default function MyList() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(
    null
  )
  const [editContractName, setEditContractName] =
    useState('')
  const [editCounterparty, setEditCounterparty] =
    useState('')
  const [editExpiryDate, setEditExpiryDate] =
    useState('')
  const [editNotes, setEditNotes] = useState('')

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

  function startEditing(contract: Contract) {
    setEditingId(contract.id)
    setEditContractName(contract.contract_name || '')
    setEditCounterparty(contract.counterparty || '')
    setEditExpiryDate(contract.expiry_date || '')
    setEditNotes(contract.notes || '')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditContractName('')
    setEditCounterparty('')
    setEditExpiryDate('')
    setEditNotes('')
  }

  async function saveContract() {
    if (!editingId) return

    const { error } = await supabase
      .from('contracts')
      .update({
        contract_name: editContractName,
        counterparty: editCounterparty || null,
        expiry_date: editExpiryDate || null,
        notes: editNotes || null,
      })
      .eq('id', editingId)

    if (error) {
      alert(error.message)
      return
    }

    cancelEditing()
    await loadContracts()
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

  async function deleteContract(contract: Contract) {
    const confirmed = window.confirm(
      `Delete "${contract.contract_name}"?`
    )

    if (!confirmed) return

    if (contract.storage_path) {
      const { error: storageError } =
        await supabase.storage
          .from('contracts')
          .remove([contract.storage_path])

      if (storageError) {
        console.error(storageError)
      }
    }

    const { error: databaseError } = await supabase
      .from('contracts')
      .delete()
      .eq('id', contract.id)

    if (databaseError) {
      alert(databaseError.message)
      return
    }

    await loadContracts()
  }

  function getDaysRemaining(
    expiryDate: string | null
  ) {
    if (!expiryDate) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expiry = new Date(
      `${expiryDate}T00:00:00`
    )

    return Math.ceil(
      (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    )
  }

  function getBorderColor(
    expiryDate: string | null
  ) {
    const days = getDaysRemaining(expiryDate)

    if (days === null) return '#94a3b8'
    if (days <= 30) return '#ef4444'
    if (days <= 90) return '#f59e0b'

    return '#22c55e'
  }

  function getStatusText(
    expiryDate: string | null
  ) {
    const days = getDaysRemaining(expiryDate)

    if (days === null) {
      return '⚪ No expiry date'
    }

    if (days < 0) {
      return `🔴 Expired ${Math.abs(days)} days ago`
    }

    if (days === 0) {
      return '🔴 Expires today'
    }

    if (days <= 30) {
      return `🔴 ${days} days remaining`
    }

    if (days <= 90) {
      return `🟠 ${days} days remaining`
    }

    return `🟢 ${days} days remaining`
  }

  function formatDate(
    expiryDate: string | null
  ) {
    if (!expiryDate) return ''

    return new Date(
      `${expiryDate}T00:00:00`
    ).toLocaleDateString('de-CH')
  }

  const filteredContracts = contracts.filter(
    (contract) => {
      const searchText = search
        .trim()
        .toLowerCase()

      if (!searchText) return true

      return (
        contract.contract_name
          ?.toLowerCase()
          .includes(searchText) ||
        contract.counterparty
          ?.toLowerCase()
          .includes(searchText) ||
        contract.notes
          ?.toLowerCase()
          .includes(searchText)
      )
    }
  )

  const activeContracts = contracts.filter(
    (contract) => {
      const days = getDaysRemaining(
        contract.expiry_date
      )

      return days === null || days > 0
    }
  ).length

  const expiringSoon = contracts.filter(
    (contract) => {
      const days = getDaysRemaining(
        contract.expiry_date
      )

      return (
        days !== null &&
        days > 0 &&
        days <= 30
      )
    }
  ).length

  const expiredContracts = contracts.filter(
    (contract) => {
      const days = getDaysRemaining(
        contract.expiry_date
      )

      return days !== null && days <= 0
    }
  ).length

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '25px',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            border: '2px solid #22c55e',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              color: '#22c55e',
              fontSize: '32px',
              margin: 0,
            }}
          >
            {activeContracts}
          </h3>

          <p>🟢 Active Contracts</p>
        </div>

        <div
          style={{
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              color: '#f59e0b',
              fontSize: '32px',
              margin: 0,
            }}
          >
            {expiringSoon}
          </h3>

          <p>🟠 Expiring in 30 Days</p>
        </div>

        <div
          style={{
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '15px',
            minWidth: '180px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              color: '#ef4444',
              fontSize: '32px',
              margin: 0,
            }}
          >
            {expiredContracts}
          </h3>

          <p>🔴 Expired</p>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="🔍 Search contracts..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {filteredContracts.length === 0 ? (
        <p>No contracts found.</p>
      ) : (
        filteredContracts.map((contract) => (
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
            {editingId === contract.id ? (
              <>
                <div
                  style={{
                    marginBottom: '10px',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Contract Name"
                    value={editContractName}
                    onChange={(event) =>
                      setEditContractName(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    marginBottom: '10px',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Counterparty"
                    value={editCounterparty}
                    onChange={(event) =>
                      setEditCounterparty(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    marginBottom: '10px',
                  }}
                >
                  <input
                    type="date"
                    value={editExpiryDate}
                    onChange={(event) =>
                      setEditExpiryDate(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    marginBottom: '10px',
                  }}
                >
                  <textarea
                    rows={4}
                    cols={40}
                    placeholder="Notes"
                    value={editNotes}
                    onChange={(event) =>
                      setEditNotes(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                  }}
                >
                  <button onClick={saveContract}>
                    Save
                  </button>

                  <button onClick={cancelEditing}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>
                  📄 {contract.contract_name}
                </h3>

                {contract.counterparty && (
                  <p>
                    🏢 {contract.counterparty}
                  </p>
                )}

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

                {!contract.expiry_date && (
                  <p>⚪ No expiry date</p>
                )}

                {contract.notes && (
                  <p>📝 {contract.notes}</p>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
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
                      startEditing(contract)
                    }
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      deleteContract(contract)
                    }
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}