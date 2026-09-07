import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import { connectDatabase } from '@article/db'

let connection: ReturnType<typeof connectDatabase> | undefined

/** Reuses one producer/status pool per web process and recovers after startup failures. */
export function database() {
  connection ??= tryCatch.async(connectDatabase).then(([db, error]) => {
    if (error) {
      connection = undefined
      throw error
    }
    return db
  })
  return connection
}
