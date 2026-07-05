import { pool } from './db.js'
import { COURTS } from './data/courts.js'

async function seed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      surface TEXT NOT NULL,
      indoor BOOLEAN NOT NULL DEFAULT false,
      courts_count INTEGER NOT NULL,
      price_per_hour NUMERIC NOT NULL DEFAULT 0
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      court_id TEXT NOT NULL REFERENCES courts(id),
      date_key TEXT NOT NULL,
      time TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM courts')
  if (rows[0].count > 0) {
    console.log(`courts table already has ${rows[0].count} row(s) — leaving existing data as-is.`)
    await pool.end()
    return
  }

  for (const court of COURTS) {
    await pool.query(
      `INSERT INTO courts (id, name, address, surface, indoor, courts_count, price_per_hour)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        court.id,
        court.name,
        court.address,
        court.surface,
        court.indoor,
        court.courtsCount,
        court.pricePerHour,
      ]
    )
  }

  console.log(`Seeded ${COURTS.length} courts.`)
  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
