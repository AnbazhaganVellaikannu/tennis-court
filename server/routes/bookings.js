import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'
import { pool } from '../db.js'

const router = Router()

function toBooking(row) {
  return {
    id: row.id,
    courtId: row.court_id,
    courtName: row.court_name,
    date: row.date_key,
    time: row.time,
    userId: row.user_id,
    playerName: row.player_name,
    createdAt: row.created_at,
  }
}

async function requireSession(req, res, next) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    return res.status(401).json({ error: 'You must be signed in.' })
  }
  req.session = session
  next()
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT bookings.*, courts.name AS court_name, "user".name AS player_name
     FROM bookings
     JOIN courts ON courts.id = bookings.court_id
     JOIN "user" ON "user".id = bookings.user_id
     ORDER BY date_key, time`
  )
  res.json(result.rows.map(toBooking))
})

router.post('/', requireSession, async (req, res) => {
  const { courtId, date, time } = req.body
  const userId = req.session.user.id

  if (!courtId || !date || !time) {
    return res.status(400).json({ error: 'courtId, date and time are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the court row so concurrent booking attempts for this venue serialize.
    const courtResult = await client.query(
      'SELECT courts_count, name FROM courts WHERE id = $1 FOR UPDATE',
      [courtId]
    )
    if (courtResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Unknown court.' })
    }
    const { courts_count: courtsCount, name: courtName } = courtResult.rows[0]

    const existing = await client.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE court_id = $1 AND date_key = $2 AND time = $3',
      [courtId, date, time]
    )
    if (existing.rows[0].count >= courtsCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'All courts are booked for that time.' })
    }

    const id = randomUUID()
    const insertResult = await client.query(
      `INSERT INTO bookings (id, court_id, date_key, time, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, courtId, date, time, userId]
    )

    await client.query('COMMIT')
    res.status(201).json(
      toBooking({ ...insertResult.rows[0], court_name: courtName, player_name: req.session.user.name })
    )
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

router.delete('/:id', requireSession, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM bookings WHERE id = $1 AND user_id = $2',
    [req.params.id, req.session.user.id]
  )
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Booking not found' })
  }
  res.status(204).end()
})

export default router
