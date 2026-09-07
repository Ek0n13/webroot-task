import { mutationOptions, queryOptions } from '@tanstack/react-query'
import {
  getArticleComparisonStatus,
  submitArticleComparison,
} from '../server/article-comparison.functions'

export type ComparisonSubmission = {
  articleA: string
  articleB: string
  requestId: string
}

export class ComparisonSubmissionError extends Error {}

const comparisonKeys = {
  status: (comparisonId: string) =>
    ['article-comparison', 'status', comparisonId] as const,
  submission: ['article-comparison', 'submission'] as const,
}

export function comparisonStatusOptions(comparisonId: string) {
  return queryOptions({
    queryKey: comparisonKeys.status(comparisonId),
    queryFn: async () => {
      const response = await getArticleComparisonStatus({
        data: { comparisonId },
      })
      if (!response.ok && response.error.code === 'STATUS_UNAVAILABLE') {
        throw new Error(response.error.message)
      }
      return response
    },
    staleTime: 2_000,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') {
        return Math.min(2_000 * 2 ** query.state.errorUpdateCount, 30_000)
      }
      const response = query.state.data
      if (
        response &&
        (!response.ok ||
          response.comparison.state === 'completed' ||
          response.comparison.state === 'failed')
      ) {
        return false
      }
      return 2_000
    },
  })
}

export const comparisonSubmissionOptions = mutationOptions({
  mutationKey: comparisonKeys.submission,
  mutationFn: async (input: ComparisonSubmission) => {
    const response = await submitArticleComparison({ data: input })
    if (!response.ok) {
      throw new ComparisonSubmissionError(
        'We could not confirm that the comparison was queued. Retry safely with the same request ID.',
      )
    }
    return response
  },
  retry: false,
})
