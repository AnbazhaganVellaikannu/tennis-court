import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { pool } from './db.js'

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  // RENDER_EXTERNAL_URL is set automatically by Render; BETTER_AUTH_URL covers local dev and other hosts.
  baseURL: process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL,
  emailAndPassword: {
    enabled: true,
  },
})
