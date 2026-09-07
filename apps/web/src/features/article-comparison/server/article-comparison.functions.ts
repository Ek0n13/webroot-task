import { createServerFn } from '@tanstack/react-start'
import {
  comparisonStatusInputSchema,
  submitComparisonSchema,
} from '@article/schemas'
import {
  comparisonStatusOnServer,
  submitComparisonOnServer,
} from './article-comparison.server'

/** Enqueues two articles and returns their pg-boss job ID immediately. */
export const submitArticleComparison = createServerFn({ method: 'POST' })
  .validator(submitComparisonSchema)
  .handler(({ data }) => submitComparisonOnServer(data))

/** Polls comparison progress and returns validated pg-boss completion output. */
export const getArticleComparisonStatus = createServerFn({ method: 'GET' })
  .validator(comparisonStatusInputSchema)
  .handler(({ data }) => comparisonStatusOnServer(data.comparisonId))
