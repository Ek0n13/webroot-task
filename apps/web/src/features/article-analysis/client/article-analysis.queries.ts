import { mutationOptions, queryOptions } from '@tanstack/react-query'
import {
  getArticleAnalysisStatus,
  getRecentArticleAnalyses,
  submitArticleAnalysis,
} from '../server/article-analysis.functions'

export type Submission = {
  article: string
  requestId: string
}

export class SubmissionError extends Error {}

const analysisKeys = {
  history: ['article-analysis', 'history'] as const,
  status: (analysisId: string) =>
    ['article-analysis', 'status', analysisId] as const,
  submission: ['article-analysis', 'submission'] as const,
}

export function historyOptions() {
  return queryOptions({
    queryKey: analysisKeys.history,
    queryFn: async () => {
      const response = await getRecentArticleAnalyses()
      if (!response.ok) throw new Error(response.error.message)
      return response.analyses
    },
    staleTime: 30_000,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error')
        return Math.min(2_000 * 2 ** query.state.errorUpdateCount, 30_000)
      return query.state.data?.some(
        (item) => item.state === 'queued' || item.state === 'processing',
      )
        ? 2_000
        : 30_000
    },
  })
}

export function statusOptions(analysisId: string) {
  return queryOptions({
    queryKey: analysisKeys.status(analysisId),
    queryFn: async () => {
      const response = await getArticleAnalysisStatus({
        data: { analysisId },
      })
      if (!response.ok && response.error.code === 'STATUS_UNAVAILABLE')
        throw new Error(response.error.message)
      return response
    },
    staleTime: 2_000,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error')
        return Math.min(2_000 * 2 ** query.state.errorUpdateCount, 30_000)
      const response = query.state.data
      if (
        response &&
        (!response.ok ||
          response.analysis.state === 'completed' ||
          response.analysis.state === 'failed')
      )
        return false
      return 2_000
    },
  })
}

export const submissionOptions = mutationOptions({
  mutationKey: analysisKeys.submission,
  mutationFn: async (input: Submission) => {
    const response = await submitArticleAnalysis({ data: input })
    if (!response.ok) {
      throw new SubmissionError(
        'We could not confirm that your article was queued. Retry this submission safely with the same request ID.',
      )
    }
    return response
  },
  retry: false,
})
