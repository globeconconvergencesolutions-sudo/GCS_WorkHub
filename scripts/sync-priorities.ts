import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { applyPriorityWorkload } from '../lib/workload/apply-priorities'

config({ path: '.env.local' })
config()

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error('DATABASE_URL is not set.')
}
const connectionUrl: string = url

async function main() {
  const db = drizzle({ client: neon(connectionUrl) })
  const result = await applyPriorityWorkload(db)
  console.log(
    `Priority pack applied: ${result.projectsTouched} projects, ${result.tasksTouched} tasks. Demo department-delivery tracks were archived.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
