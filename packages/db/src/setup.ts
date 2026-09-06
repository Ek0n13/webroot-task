import { configureQueue, connectDatabase } from './index'
import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import { migrate } from './migrate'

/** Explicit setup entrypoint; schema changes are never applied by an HTTP request. */
async function setup() {
  const db = await connectDatabase({ migrate: true })
  const [, setupError] = await tryCatch.async(async () => {
    await migrate(db)
    await configureQueue(db.boss)
    console.info('Application migrations and analysis queue are ready.')
  })
  // Close the pool on both success and failure before propagating the setup error.
  await db.close()
  if (setupError) throw setupError
}

const [, setupError] = await tryCatch.async(setup)
if (setupError) {
  console.error(
    'Database setup failed. Check DATABASE_URL and PostgreSQL availability.',
  )
  process.exitCode = 1
}
