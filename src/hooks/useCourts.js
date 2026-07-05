import { useEffect, useState } from 'react'

export function useCourts() {
  const [courts, setCourts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/courts')
        if (!res.ok) throw new Error('Failed to load courts')
        const data = await res.json()
        if (!cancelled) setCourts(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { courts, loading, error }
}
