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

  const [editingId, setEditingId] = useState<string | null>(null)

  const [editContractName, setEditContractName] =
    useState('')

  const [editCounterparty, setEditCounterparty] =
    useState('')

  const [editExpiryDate, setEditExpiryDate] =
    useState('')

  const [editNotes, setEditNotes] =
    useState('')

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

    setEditNotes(
      contract.notes || ''
    )
  }

  async function saveContract() {
    if (!editingId) return

    const { error } = await supabase
      .from('contracts')
      .update({
        contract_name: editContractName,
        counterparty: editCounterparty,
        expiry_date: editExpiryDate || null,
        notes: editNotes || null,
      })
      .eq('id', editingId)

    if (error) {
      alert(error.message)
      return
    }

    setEditingId(null)
    loadContracts()
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

  const filteredContracts = contracts.filter(
    (contract) => {
      const txt = search.toLowerCase()

      return (
        contract.contract_name
          ?.toLowerCase()
          .includes(txt) ||
        contract.counterparty
          ?.toLowerCase()
          .includes(txt) ||
        contract.notes
          ?.toLowerCase()
          .includes(txt)
      )
    }
  )

  const activeContracts = contracts.filter(
    (contract) => {
      if (!contract.expiry_date) return true

      return (
        new Date(contract.expiry_date) >
        new Date()
      )
    }
  ).length

  const expiringSoon = contracts.filter(
    (contract) => {
      if (!contract.expiry_date) return false

      const today = new Date()
      const expiry = new Date(contract.expiry_date)

      const days = Math.ceil(
        (expiry.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24)
      )

      return days > 0 && days <= 30
    }
  ).length

  const expiredContracts = contracts.filter(
    (contract) => {
      if (!contract.expiry_date) return false

      return (
        new Date(contract.expiry_date) <=
        new Date()
      )
    }
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
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />
      </div>

      {filteredContracts.map((contract) => (
        <div
          key={contract.id}
          style={{
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '10px',
          }}
        >
          {editingId === contract.id ? (
            <>
              <input
                type="text"
                value={editContractName}
                onChange={(e) =>
                  setEditContractName(
                    e.target.value
                  )
                }
              />

              <br />
              <br />

              <input
                type="text"
                value={editCounterparty}
                onChange={(e) =>
                  setEditCounterparty(
                    e.target.value
                  )
                }
              />

              <br />
              <br />

              <input
                type="date"
                value={editExpiryDate}
                onChange={(e) =>
                  setEditExpiryDate(
                    e.target.value
                  )
                }
              />

              <br />
              <br />

              <textarea
                rows={4}
                cols={40}
                value={editNotes}
                onChange={(e) =>
                  setEditNotes(
                    e.target.value
                  )
                }
              />

              <br />
              <br />

              <button onClick={saveContract}>
                Save
              </button>

              <button
                onClick={() =>
                  setEditingId(null)
                }
                style={{
                  marginLeft: '10px',
                }}
              >
                Cancel
              </button>
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
                <p>
                  📅 {contract.expiry_date}
                </p>
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
                    startEditing(contract)
                  }
                >
                  Edit
                </button>

                <button
                  onClick={() =>
                    deleteContract(
                      contract.id
                    )
                  }
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}