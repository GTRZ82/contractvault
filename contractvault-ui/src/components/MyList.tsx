import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MyList() {
  const [files, setFiles] = useState<string[]>([])

  useEffect(() => {
    loadFiles()
  }, [])

  async function loadFiles() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase.storage
      .from('contracts')
      .list(user.id)

    if (error) {
      console.error(error)
      return
    }

    if (!data) return

    setFiles(data.map((file) => file.name))
  }

  async function openContract(file: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase.storage
      .from('contracts')
      .createSignedUrl(`${user.id}/${file}`, 60)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function deleteContract(file: string) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this contract?'
    )

    if (!confirmed) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert('User not found')
      return
    }

    console.log('Deleting:', `${user.id}/${file}`)

    const { data, error } = await supabase.storage
      .from('contracts')
      .remove([`${user.id}/${file}`])

    console.log('Delete result:', data)
    console.log('Delete error:', error)

    if (error) {
      alert(error.message)
      return
    }

    alert('Contract deleted successfully')

    loadFiles()
  }

  return (
    <div>
      {files.length === 0 ? (
        <p>No contracts uploaded yet</p>
      ) : (
        files.map((file) => (
          <div
            key={file}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '10px',
            }}
          >
            <button
              onClick={() => openContract(file)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              📄 {file.split('-').slice(1).join('-')}
            </button>

            <button
              onClick={() => deleteContract(file)}
            >
              🗑 Delete
            </button>
          </div>
        ))
      )}
    </div>
  )
}