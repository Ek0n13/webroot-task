import { createServerFn } from '@tanstack/react-start'
import {
  analysisStatusInputSchema,
  submitAnalysisSchema,
} from '@article/schemas'
import {
  listOnServer,
  statusOnServer,
  submitOnServer,
} from './article-analysis.server'

/**
 * Validates article input and atomically creates a durable queue job.
 * Reuse requestId on network retry to avoid duplicate paid analyses.
 *
 * @example
 * await submitArticleAnalysis({ data: { article: articleText, requestId: crypto.randomUUID() } })
 *
 * @returns An analysis ID immediately, not the completed briefing.
 * @throws For input-validation or RPC transport failures.
 */
export const submitArticleAnalysis = createServerFn({ method: 'POST' })
  .validator(submitAnalysisSchema)
  .handler(({ data }) => submitOnServer(data))

/**
 * Reads analysis status. Poll every two seconds and stop on
 * completed/failed/NOT_FOUND; back off on transient STATUS_UNAVAILABLE errors.
 *
 * @example
 * await getArticleAnalysisStatus({ data: { analysisId } })
 */
export const getArticleAnalysisStatus = createServerFn({ method: 'GET' })
  .validator(analysisStatusInputSchema)
  .handler(({ data }) => statusOnServer(data.analysisId))

/** Lists the latest 50 unexpired analysis summaries. */
export const getRecentArticleAnalyses = createServerFn({
  method: 'GET',
}).handler(() => listOnServer())
