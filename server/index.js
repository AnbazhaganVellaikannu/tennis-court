import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import courtsRouter from './routes/courts.js'
import bookingsRouter from './routes/bookings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const port = process.env.PORT || 3001

const app = express()

// Better Auth reads the raw request body itself, so it must be mounted before express.json().
app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())

app.use('/api/courts', courtsRouter)
app.use('/api/bookings', bookingsRouter)

app.use(express.static(distPath))
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
