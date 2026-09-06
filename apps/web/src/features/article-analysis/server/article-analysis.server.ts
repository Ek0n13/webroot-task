import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import {
  connectDatabase,
  getAnalysisStatus,
  listRecentAnalyses,
  submitAnalysis,
} from '@article/db'

let connection: ReturnType<typeof connectDatabase> | undefined

/** Reuses the producer pool per process and allows recovery from failed initial connections. */
function database() {
  connection ??= tryCatch.async(connectDatabase).then(([db, error]) => {
    if (error) {
      connection = undefined
      throw error
    }
    return db
  })
  return connection
}

/** Creates a durable job without importing the worker or calling an LLM in the request. */
export async function submitOnServer(input: {
  article: string
  requestId: string
}) {
  const [submission, error] = await tryCatch.async(async () =>
    submitAnalysis(await database(), input),
  )
  if (error) {
    return {
      ok: false as const,
      error: {
        code: 'SUBMISSION_FAILED' as const,
        message: 'Could not queue the article. Retry with the same request ID.',
      },
    }
  }
  return { ok: true as const, ...submission }
}

/** Returns a job's status/result with sanitized database failures. */
export async function statusOnServer(analysisId: string) {
  const [analysis, error] = await tryCatch.async(async () =>
    getAnalysisStatus(await database(), analysisId),
  )
  if (error) {
    return {
      ok: false as const,
      error: {
        code: 'STATUS_UNAVAILABLE' as const,
        message: 'Could not read analysis status. Please try again.',
      },
    }
  }
  return analysis
    ? { ok: true as const, analysis }
    : {
        ok: false as const,
        error: { code: 'NOT_FOUND' as const, message: 'Analysis not found.' },
      }
}

/** Returns recent analysis summaries. */
export async function listOnServer() {
  const [analyses, error] = await tryCatch.async(async () =>
    listRecentAnalyses(await database()),
  )
  if (error) {
    return {
      ok: false as const,
      error: {
        code: 'HISTORY_UNAVAILABLE' as const,
        message: 'Could not read recent analyses. Please try again.',
      },
    }
  }
  return { ok: true as const, analyses }
}
