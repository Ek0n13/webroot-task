import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import { getComparisonStatus, submitComparison } from '@article/db'
import { database } from '../../../server/database.server'
import type { ArticleComparisonInput } from '@article/schemas'

/** Queues a comparison using pg-boss itself as the only persistence layer. */
export async function submitComparisonOnServer(
  input: ArticleComparisonInput & { requestId: string },
) {
  const [submission, error] = await tryCatch.async(async () =>
    submitComparison(await database(), input),
  )
  if (error) {
    return {
      ok: false as const,
      error: {
        code: 'SUBMISSION_FAILED' as const,
        message:
          'Could not queue the comparison. Retry with the same request ID.',
      },
    }
  }
  return { ok: true as const, ...submission }
}

/** Reads and sanitizes comparison state/output stored on the pg-boss job. */
export async function comparisonStatusOnServer(comparisonId: string) {
  const [comparison, error] = await tryCatch.async(async () =>
    getComparisonStatus(await database(), comparisonId),
  )
  if (error) {
    return {
      ok: false as const,
      error: {
        code: 'STATUS_UNAVAILABLE' as const,
        message: 'Could not read comparison status. Please try again.',
      },
    }
  }
  return comparison
    ? { ok: true as const, comparison }
    : {
        ok: false as const,
        error: {
          code: 'NOT_FOUND' as const,
          message: 'Comparison not found.',
        },
      }
}
