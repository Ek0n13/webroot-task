import { readFile } from 'node:fs/promises'
import { transaction } from './index'
import type { Database } from './index'

/** Applies versioned application migrations once, serialized by a transaction advisory lock. */
export async function migrate(db: Database) {
  await transaction(db.pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(739184621)')
    await client.query(
      'CREATE TABLE IF NOT EXISTS app_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    )
    // Keep applied migrations unchanged; later files upgrade existing local databases.
    for (const version of [
      '001_analyses',
      '002_simplify_worker',
      '003_simplify_analyses',
    ]) {
      const exists = await client.query(
        'SELECT 1 FROM app_migrations WHERE version = $1',
        [version],
      )
      if (exists.rowCount) continue
      await client.query(
        await readFile(
          new URL(`../migrations/${version}.sql`, import.meta.url),
          'utf8',
        ),
      )
      await client.query('INSERT INTO app_migrations (version) VALUES ($1)', [
        version,
      ])
    }
  })
}
