import { useCallback, useEffect, useState } from 'react'

const BOOKINGS_URL = '/api/bookings'

export function useBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(BOOKINGS_URL)
      if (!res.ok) throw new Error('Failed to load bookings')
      setBookings(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addBooking(booking) {
    const res = await fetch(BOOKINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create booking')
    }
    setBookings((prev) => [...prev, data])
    return data
  }

  async function cancelBooking(id) {
    const res = await fetch(`${BOOKINGS_URL}/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      throw new Error('Failed to cancel booking')
    }
    setBookings((prev) => prev.filter((b) => b.id !== id))
  }

  return { bookings, loading, error, addBooking, cancelBooking, refresh }
}
