import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function UploadContract() {
  const [message, setMessage] = useState('')
  const [contractName, setContractName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMessage('Please login first')
        return
      }

      const filePath = `${user.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, file)

      if (uploadError) {
        setMessage(uploadError.message)
        return
      }

      const { error: dbError } = await supabase
        .from('contracts')
        .insert([
          {
            user_id: user.id,
            file_name: file.name,
            storage_path: filePath,
            contract_name: contractName || file.name,
            expiry_date: expiryDate || null,
            notes: notes || null,
          },
        ])

      if (dbError) {
        setMessage(dbError.message)
        return
      }

      setContractName('')
      setExpiryDate('')
      setNotes('')

      setMessage('✅ Contract uploaded successfully')
    } catch (err) {
      setMessage('Upload failed')
      console.error(err)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Contract Name"
          value={contractName}
          onChange={(e) => setContractName(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          cols={40}
        />
      </div>

      <input
        type="file"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        onChange={handleFileChange}
      />

      <p>{message}</p>
    </div>
  )
}