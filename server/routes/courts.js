import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

function toCourt(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    surface: row.surface,
    indoor: row.indoor,
    courtsCount: row.courts_count,
    pricePerHour: Number(row.price_per_hour),
  }
}

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM courts ORDER BY name')
  res.json(result.rows.map(toCourt))
})

export default router
