import { useState } from 'react'
import { useCourts } from './hooks/useCourts'
import { useBookings } from './hooks/useBookings'
import { authClient } from './lib/auth-client'
import AuthForm from './components/AuthForm'
import CourtList from './components/CourtList'
import CourtDetail from './components/CourtDetail'
import MyBookings from './components/MyBookings'
import './App.css'

function App() {
  const [view, setView] = useState('courts')
  const [selectedCourtId, setSelectedCourtId] = useState(null)
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const { courts, loading: courtsLoading, error: courtsError } = useCourts()
  const { bookings, addBooking, cancelBooking } = useBookings()

  const selectedCourt = courts.find((c) => c.id === selectedCourtId)

  function handleSelectCourt(courtId) {
    setSelectedCourtId(courtId)
    setView('court')
  }

  if (sessionPending) {
    return <p className="empty-state">Loading…</p>
  }

  if (!session) {
    return <AuthForm />
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎾 Court Booker</h1>
        <nav className="tabs">
          <button
            className={view === 'courts' || view === 'court' ? 'tab active' : 'tab'}
            onClick={() => setView('courts')}
          >
            Courts
          </button>
          <button
            className={view === 'my-bookings' ? 'tab active' : 'tab'}
            onClick={() => setView('my-bookings')}
          >
            My Bookings
          </button>
        </nav>
        <div className="account-field">
          <span>{session.user.name}</span>
          <button className="link-button" onClick={() => authClient.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        {view === 'courts' && courtsLoading && <p className="empty-state">Loading courts…</p>}
        {view === 'courts' && courtsError && (
          <p className="empty-state">Couldn't load courts: {courtsError}</p>
        )}
        {view === 'courts' && !courtsLoading && !courtsError && (
          <CourtList courts={courts} onSelect={handleSelectCourt} />
        )}

        {view === 'court' && selectedCourt && (
          <CourtDetail
            court={selectedCourt}
            bookings={bookings}
            onBook={addBooking}
            onBack={() => setView('courts')}
          />
        )}

        {view === 'my-bookings' && (
          <MyBookings
            bookings={bookings}
            currentUserId={session.user.id}
            onCancel={cancelBooking}
          />
        )}
      </main>
    </div>
  )
}

export default App
