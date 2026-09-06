import { tryCatch } from '@maxmorozoff/try-catch-tuple'
import { openrouter } from '@openrouter/ai-sdk-provider'
import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from 'ai'
import {
  ANALYSIS_QUEUE,
  claimQueuedAnalysisAndLoadArticle,
  connectDatabase,
  pruneAnalyses,
  saveAnalysisResult,
} from '@article/db'
import {
  analysisJobSchema,
  articleAnalysisInputSchema,
  articleBriefingSchema,
  articleClassificationSchema,
} from '@article/schemas'
import {
  classificationSystemPrompt,
  createAnalysisPrompt,
  createAnalysisSystemPrompt,
  createClassificationPrompt,
} from './article-analysis.prompts'
import type { Database } from '@article/db'
import type {
  ArticleAnalysisInput,
  ArticleAnalysisResult,
} from '@article/schemas'
import type { Job } from 'pg-boss'

export type Analyzer = (
  input: ArticleAnalysisInput,
) => Promise<ArticleAnalysisResult>

export async function handleAnalysisJob(
  db: Database,
  job: Job<unknown>,
  analyze: Analyzer = analyzeArticle,
) {
  const [, error] = await tryCatch.async(async () => {
    const { analysisId } = analysisJobSchema.parse(job.data)
    if (analysisId !== job.id) throw new Error('Invalid analysis job.')

    const article = await claimQueuedAnalysisAndLoadArticle(db, analysisId)
    if (article === null) {
      console.error('Article already claimed or not found.')
      return
    }

    const result = await analyze(articleAnalysisInputSchema.parse({ article }))
    await saveAnalysisResult(db, analysisId, result)
  })

  if (error) {
    throw new Error(
      'The analysis job could not finish. Please submit the article again.',
    )
  }
}

export async function analyzeArticle(
  input: ArticleAnalysisInput,
): Promise<ArticleAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  const modelName = process.env.OPENROUTER_MODEL?.trim()
  if (
    !apiKey ||
    apiKey === 'replace-with-your-openrouter-api-key' ||
    !modelName
  ) {
    return {
      ok: false,
      error: {
        code: 'CONFIGURATION',
        message: 'OpenRouter configuration is missing or invalid.',
        retryable: false,
      },
    }
  }

  const model = openrouter(modelName, {
    structuredOutputs: { strict: true },
    reasoning: { effort: 'low', exclude: true },
  })

  // we have a two step approach
  // step 1: we classify the kind of article
  // step 2: we take the summary using a prompt for the specific kind of article
  const [analysis, error] = await tryCatch.async<ArticleAnalysisResult>(
    async () => {
      const [classification, classificationError] = await tryCatch.async(
        async () => {
          const result = await generateText({
            model,
            maxRetries: 0,
            output: Output.object({
              schema: articleClassificationSchema,
              name: 'article_classification',
            }),
            instructions: classificationSystemPrompt,
            prompt: createClassificationPrompt(input.article),
            maxOutputTokens: 4_096,
          })
          if (result.finishReason !== 'stop')
            throw new NoObjectGeneratedError(result)
          return result
        },
      )

      const invalidClassification =
        NoObjectGeneratedError.isInstance(classificationError) ||
        NoOutputGeneratedError.isInstance(classificationError)
      if (classificationError && !invalidClassification)
        throw classificationError

      const articleType = classification?.output.type ?? 'general'
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [briefing, briefingError] = await tryCatch.async(async () => {
          const result = await generateText({
            model,
            maxRetries: 0,
            output: Output.object({
              schema: articleBriefingSchema,
              name: 'article_briefing',
            }),
            instructions: createAnalysisSystemPrompt(articleType),
            prompt: createAnalysisPrompt(input.article, attempt > 0),
            maxOutputTokens: 8_192,
          })
          if (result.finishReason !== 'stop')
            throw new NoObjectGeneratedError(result)
          return result
        })

        if (briefing) {
          const usage = {
            promptTokens:
              (classification?.usage.inputTokens ?? 0) +
              (briefing.usage.inputTokens ?? 0),
            completionTokens:
              (classification?.usage.outputTokens ?? 0) +
              (briefing.usage.outputTokens ?? 0),
            totalTokens:
              (classification?.usage.totalTokens ?? 0) +
              (briefing.usage.totalTokens ?? 0),
          }
          return {
            ok: true,
            briefing: briefing.output,
            metadata: {
              model: briefing.response.modelId || modelName,
              articleType,
              classificationConfidence:
                classification?.output.confidence ?? null,
              usedClassificationFallback: invalidClassification,
              analyzedAt: new Date().toISOString(),
              usage,
            },
          }
        }

        const invalidBriefing =
          NoObjectGeneratedError.isInstance(briefingError) ||
          NoOutputGeneratedError.isInstance(briefingError)
        if (!invalidBriefing || attempt === 1) throw briefingError
      }

      throw new Error('Analysis ended without a result.')
    },
  )
  if (!error) return analysis

  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    const incomplete =
      NoObjectGeneratedError.isInstance(error) && error.finishReason !== 'stop'
    return {
      ok: false,
      error: {
        code: incomplete ? 'INCOMPLETE_RESPONSE' : 'INVALID_RESPONSE',
        message: incomplete
          ? 'The analysis provider returned an incomplete response.'
          : 'The analysis provider returned an invalid briefing.',
        retryable: true,
      },
    }
  }

  return {
    ok: false,
    error: {
      code: 'PROVIDER_ERROR',
      message: 'The analysis provider could not complete this request.',
      retryable: true,
    },
  }
}

async function main() {
  const concurrency = Number(process.env.WORKER_CONCURRENCY)
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('WORKER_CONCURRENCY must be an integer from 1 to 8.')
  }

  const db = await connectDatabase({ supervise: true })
  const [, workerError] = await tryCatch.async(async () => {
    await pruneAnalyses(db)
    // work() registers pg-boss's background poller and then returns.
    await db.boss.work(
      ANALYSIS_QUEUE,
      { batchSize: 1, localConcurrency: concurrency },
      async ([job]) => handleAnalysisJob(db, job),
    )
  })
  if (workerError) {
    console.log('There was an issue setting up the worker. Closing...')
    await db.close()
    throw workerError
  }

  const cleanupTimer = setInterval(
    async () => {
      const [, error] = await tryCatch.async(() => pruneAnalyses(db))
      if (error) console.error('Analysis retention cleanup failed.')
    },
    60 * 60 * 1_000,
  )
  // pg-boss keeps the process alive; this housekeeping timer should not.
  cleanupTimer.unref()

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    clearInterval(cleanupTimer)
    const [, error] = await tryCatch.async(() => db.close())
    if (error) {
      console.error('Worker shutdown failed.')
      process.exitCode = 1
    }
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  console.info(`Analysis worker ready (concurrency ${concurrency}).`)
}

const [, error] = await tryCatch.async(main)
if (error) {
  console.error(
    'Worker startup failed. Check database migrations, DATABASE_URL, WORKER_CONCURRENCY, and OpenRouter configuration.',
  )
  process.exitCode = 1
}
