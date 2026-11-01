import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import UploadContract from '../components/UploadContract'
import ContractList from '../components/MyList'

export default function ContractsPage() {
  const [email, setEmail] = useState('')
  const [isAddDocumentOpen, setIsAddDocumentOpen] = useState(false)
  const [documentListKey, setDocumentListKey] = useState(0)

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

  if (user) {
  setEmail(user.email || '')
}
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  function openAddDocument() {
    setIsAddDocumentOpen(true)
    window.requestAnimationFrame(() => {
      document.getElementById('add-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function closeAddDocument() {
    setIsAddDocumentOpen(false)
  }

  function handleDocumentSaved() {
    setIsAddDocumentOpen(false)
    setDocumentListKey((current) => current + 1)
    window.requestAnimationFrame(() => {
      document.getElementById('my-documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">CV</div>
          <div>
            <h1>ContractVault</h1>
            <p>Contracts and invoices, organized securely.</p>
          </div>
        </div>
        <div className="header-actions">
          {email && <span className="account-email">{email}</span>}
          <button className="primary-action" type="button" onClick={openAddDocument}>＋ Add Document</button>
          <button className="secondary-action" onClick={logout}>Logout</button>
        </div>
      </header>

      <main>
        {isAddDocumentOpen && (
          <section className="add-document-section" id="add-document">
            <div className="section-heading">
              <div>
                <span className="section-kicker">NEW DOCUMENT</span>
                <h2>Add Document</h2>
              </div>
              <button className="secondary-action add-document-close" type="button" onClick={closeAddDocument}>Close</button>
            </div>
            <UploadContract onDocumentSaved={handleDocumentSaved} onCancel={closeAddDocument} />
          </section>
        )}

        <section className="documents-section" id="my-documents">
          <div className="section-heading">
            <div>
              <span className="section-kicker">WORKSPACE</span>
              <h2>My Documents</h2>
            </div>
            <span className="documents-subtitle">Contracts and invoices</span>
          </div>
          <ContractList key={documentListKey} />
        </section>
      </main>
    </div>
  )
}
``