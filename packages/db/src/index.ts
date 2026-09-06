import { randomUUID } from 'node:crypto'
import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { articleAnalysisInputSchema } from '@article/schemas'
import type {
  AnalysisHistoryItem,
  AnalysisStatus,
  ArticleAnalysisResult,
} from '@article/schemas'
import type { PoolClient } from 'pg'

/** Single queue for classification and briefing generation. */
export const ANALYSIS_QUEUE = 'article-analysis'
/** A crashed worker's job becomes failed after this timeout and the next maintenance pass. */
export const ANALYSIS_EXPIRY_SECONDS = 120

/** PostgreSQL resources owned by a web/worker process, never exported to browser code. */
export type Database = Awaited<ReturnType<typeof connectDatabase>>

/**
 * Opens a shared PostgreSQL pool and pg-boss instance.
 *
 * @param options - Connection and runtime settings; migrate only in the explicit setup command.
 * @returns Resources plus a shutdown function. Runtime processes require prior migrations.
 */
export async function connectDatabase(
  options: {
    connectionString?: string
    migrate?: boolean
    supervise?: boolean
  } = {},
) {
  // Environment files are loaded by Node/Vite at startup. Never silently connect
  // to a development database when deployment configuration is missing.
  const connectionString = (
    options.connectionString ?? process.env.DATABASE_URL
  )?.trim()
  const [url, urlError] = tryCatch.sync(() => new URL(connectionString ?? ''))
  if (urlError || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }
  const pool = new Pool({
    connectionString,
    max: 6,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    idleTimeoutMillis: 30_000,
  })
  pool.on('error', () => console.error('PostgreSQL connection error.'))
  const boss = new PgBoss({
    db: { executeSql: (text, values) => pool.query(text, values) },
    migrate: options.migrate ?? false,
    supervise: options.supervise ?? false,
    schedule: false,
  })
  boss.on('error', () =>
    console.error('Queue connection or maintenance error.'),
  )
  // start() prepares pg-boss. It does not register our article handler;
  // only the worker process does that, by calling boss.work().
  const [, startError] = await tryCatch.async(() => boss.start())
  if (startError) {
    await boss.stop({ graceful: false })
    await pool.end()
    throw startError
  }
  return {
    pool,
    boss,
    /** Stops queue consumers before closing the pool they share. */
    async close() {
      await boss.stop({ graceful: true, timeout: 100_000 })
      await pool.end()
    },
  }
}

/**
 * Creates the named queue during `pnpm db:migrate`; it does not start a worker.
 * Automatic retries are off: a failed paid analysis requires an explicit new submission.
 */
export async function configureQueue(boss: PgBoss) {
  const options = {
    retryLimit: 0,
    expireInSeconds: ANALYSIS_EXPIRY_SECONDS,
    retentionSeconds: 86_400,
    deleteAfterSeconds: 86_400,
  }
  await boss.createQueue(ANALYSIS_QUEUE, options)
  await boss.updateQueue(ANALYSIS_QUEUE, options)

  // Jobs queued by the previous implementation keep their original retry settings.
  // Update those too when migrating; workers must be stopped during this change.
  for (const job of await boss.findJobs(ANALYSIS_QUEUE, { queued: true })) {
    await boss.update(ANALYSIS_QUEUE, undefined, { id: job.id, retryLimit: 0 })
  }
}

/**
 * Commits application writes and pg-boss operations on the same connection.
 * A thrown error rolls back both; never perform LLM/network work in this transaction.
 */
export async function transaction<T>(
  pool: Pool,
  execute: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect()
  const [result, error] = await tryCatch.async(async () => {
    await client.query('BEGIN')
    const value = await execute(client)
    await client.query('COMMIT')
    return value
  })
  if (error) {
    const [, rollbackError] = await tryCatch.async(() =>
      client.query('ROLLBACK'),
    )
    // Release the connection even when rollback fails, just as a finally block would.
    client.release()
    throw rollbackError ?? error
  }
  client.release()
  return result
}

/**
 * Called by the WEB APP, not the worker: saves the article and enqueues its ID.
 * Both writes share one transaction, so either both exist or neither does.
 * Reusing a request ID returns the existing analysis without another job.
 *
 * @throws If enqueue fails or an idempotency key is reused with different text.
 */
export async function submitAnalysis(
  db: Database,
  input: { article: string; requestId: string },
) {
  const { article } = articleAnalysisInputSchema.parse({
    article: input.article,
  })
  return transaction(db.pool, async (client) => {
    // First save the source text. The worker will load it later using this ID.
    const id = randomUUID()
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO analyses (id, request_id, article) VALUES ($1, $2, $3)
       ON CONFLICT (request_id) DO NOTHING RETURNING id`,
      [id, input.requestId, article],
    )
    if (!inserted.rowCount) {
      // The browser retried a submission whose response was lost. Do not charge twice.
      const existing = await client.query<{ id: string; article: string }>(
        'SELECT id, article FROM analyses WHERE request_id = $1',
        [input.requestId],
      )
      if (existing.rows[0]?.article !== article)
        throw new Error('Idempotency key conflict.')
      return { analysisId: existing.rows[0].id }
    }
    // send() inserts a PostgreSQL queue row. It does not call the handler or the LLM.
    const jobId = await db.boss.send(
      ANALYSIS_QUEUE,
      { analysisId: id },
      {
        id,
        // Use this transaction's connection, not pg-boss's normal pool connection.
        db: { executeSql: (text, values) => client.query(text, values) },
      },
    )
    if (!jobId) throw new Error('Analysis could not be queued.')
    return { analysisId: id }
  })
}

type AnalysisRow = {
  id: string
  article: string
  state: 'queued' | 'processing' | 'completed' | 'failed'
  result: ArticleAnalysisResult | null
}

/** Safe terminal result for a crashed/expired queue job, never pg-boss's raw error output. */
const interruptedResult: ArticleAnalysisResult = {
  ok: false,
  error: {
    code: 'PROVIDER_ERROR',
    message: 'Analysis could not finish. Please submit again.',
    retryable: true,
  },
}

/**
 * Reconciles failed/crashed queue jobs so a killed worker cannot leave the UI
 * permanently processing. Source article text is not returned.
 */
export async function getAnalysisStatus(
  db: Database,
  id: string,
): Promise<AnalysisStatus | null> {
  const query =
    'SELECT id, state, result FROM analyses WHERE id = $1 AND expires_at > now()'
  let row = (await db.pool.query<AnalysisRow>(query, [id])).rows.at(0)
  if (!row) return null
  if (row.state === 'queued' || row.state === 'processing') {
    // A process crash cannot save an application error. In that case pg-boss's
    // failed/expired queue state tells us to stop showing "processing" to the user.
    const job = (await db.boss.findJobs(ANALYSIS_QUEUE, { id })).at(0)
    if (!job || ['failed', 'cancelled', 'completed'].includes(job.state)) {
      await db.pool.query(
        `UPDATE analyses SET state = 'failed', result = $2, updated_at = now()
         WHERE id = $1 AND state IN ('queued', 'processing')`,
        [id, interruptedResult],
      )
      row = (await db.pool.query<AnalysisRow>(query, [id])).rows.at(0)
      if (!row) return null
    } else {
      return { id, state: job.state === 'active' ? 'processing' : 'queued' }
    }
  }
  if (row.result?.ok) return { id, state: 'completed', result: row.result }
  if (row.result) return { id, state: 'failed', error: row.result.error }
  return { id, state: row.state === 'processing' ? 'processing' : 'queued' }
}

/** Lists the latest 50 unexpired analyses without loading full articles/results. */
export async function listRecentAnalyses(
  db: Database,
): Promise<Array<AnalysisHistoryItem>> {
  const { rows } = await db.pool.query<
    Omit<AnalysisHistoryItem, 'createdAt'> & { createdAt: Date }
  >(
    `SELECT id, left(article, 160) AS preview, state, created_at AS "createdAt",
       CASE WHEN state = 'completed' THEN result #>> '{briefing,editorial,category}'
         ELSE NULL END AS category
     FROM analyses WHERE expires_at > now()
     ORDER BY created_at DESC, id DESC LIMIT 50`,
  )
  const analyses: Array<AnalysisHistoryItem> = []
  for (const row of rows) {
    let { state, category } = row
    if (state === 'queued' || state === 'processing') {
      // Reuse status reconciliation so crashed jobs cannot stay active in history.
      const status = await getAnalysisStatus(db, row.id)
      if (!status) continue
      state = status.state
      category =
        status.state === 'completed'
          ? status.result.briefing.editorial.category
          : null
    }
    analyses.push({
      id: row.id,
      preview: row.preview,
      state,
      createdAt: row.createdAt.toISOString(),
      category,
    })
  }
  return analyses
}

/**
 * Marks an article as processing and returns its text to the worker.
 * Updating only queued rows prevents duplicate callbacks from running the LLM twice.
 * @returns Source text, or null when the record is expired, missing, or already started.
 */
export async function claimQueuedAnalysisAndLoadArticle(
  db: Database,
  id: string,
) {
  const result = await db.pool.query<{ article: string }>(
    `UPDATE analyses SET state = 'processing', updated_at = now()
     WHERE id = $1 AND state = 'queued' AND expires_at > now()
      RETURNING article`,
    [id],
  )
  return result.rows.at(0)?.article ?? null
}

/**
 * Saves either the briefing or its safe error. This updates our table only;
 * pg-boss completes the queue job when the handler returns.
 * A terminal record is never overwritten by a late callback.
 */
export async function saveAnalysisResult(
  db: Database,
  id: string,
  result: ArticleAnalysisResult,
) {
  await db.pool.query(
    `UPDATE analyses SET state = $2, result = $3, updated_at = now()
     WHERE id = $1 AND state = 'processing' AND expires_at > now()`,
    [id, result.ok ? 'completed' : 'failed', result],
  )
}

/** Deletes expired articles/results. Queue payloads contain IDs only and expire separately. */
export async function pruneAnalyses(db: Database) {
  await db.pool.query('DELETE FROM analyses WHERE expires_at <= now()')
}
