import { z } from 'zod'

/** Minimum trimmed article length in JavaScript UTF-16 code units, not tokens. */
export const ARTICLE_MIN_LENGTH = 100
/** Maximum trimmed article length accepted by the application, independent of model limits. */
export const ARTICLE_MAX_LENGTH = 50_000

/** Allowed editorial lenses; `general` also serves as the classifier fallback. */
export const articleTypes = [
  'breaking-news',
  'politics-policy',
  'business-economy',
  'science-technology',
  'health',
  'environment',
  'crime-justice',
  'culture-entertainment',
  'sports',
  'opinion-analysis',
  'general',
] as const

/** Restricts model-selected labels to the application's static prompt registry. */
export const articleTypeSchema = z.enum(articleTypes)

/** Validated label used to select an editorial analysis lens. */
export type ArticleType = z.infer<typeof articleTypeSchema>

/**
 * POST input contract: trims source text, applies length limits, and rejects
 * unexpected fields. Media uploads and article URLs are not accepted.
 */
export const articleAnalysisInputSchema = z
  .object({
    article: z
      .string()
      .trim()
      .min(
        ARTICLE_MIN_LENGTH,
        `Article text must contain at least ${ARTICLE_MIN_LENGTH} characters.`,
      )
      .max(
        ARTICLE_MAX_LENGTH,
        `Article text must contain no more than ${ARTICLE_MAX_LENGTH} characters.`,
      ),
  })
  .strict()

/** Parsed article input; the TypeScript type alone does not enforce length limits. */
export type ArticleAnalysisInput = z.infer<typeof articleAnalysisInputSchema>

/**
 * Structured classifier output. Confidence is the model's self-assessment on a
 * zero-to-one scale, not a calibrated probability or factual-verification score.
 */
export const articleClassificationSchema = z
  .object({
    type: articleTypeSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string().trim().min(1).max(300),
  })
  .strict()

/** Editorial classification and its model-supplied rationale. */
export type ArticleClassification = z.infer<typeof articleClassificationSchema>

/** A source-mentioned entity and its relevance to the article. */
const entitySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(['person', 'organisation', 'location', 'event', 'other']),
    relevance: z.string().trim().min(1).max(400),
  })
  .strict()

/** A candidate for independent verification, not a verified fact; attribution may be absent. */
// const checkableClaimSchema = z
//   .object({
//     claim: z.string().trim().min(1).max(600),
//     attribution: z.string().trim().min(1).max(300).nullable(),
//     verificationPriority: z.enum(['high', 'medium', 'low']),
//   })
//   .strict()

/**
 * Complete briefing contract used for both SDK JSON Schema generation and
 * runtime validation. All sections are required; arrays may be empty when the
 * article supplies no relevant information. Validation checks structure and
 * bounds, not the factual accuracy of generated statements.
 */
export const articleBriefingSchema = z
  .object({
    summary: z
      .string()
      .trim()
      .min(1)
      .max(1_500)
      .describe('A concise two-to-four sentence account of the article.'),
    keyDevelopments: z
      .array(z.string().trim().min(1).max(500))
      .max(8)
      .describe('The most important distinct developments in the article.'),
    entities: z.array(entitySchema).max(20),
    topics: z.array(z.string().trim().min(1).max(100)).max(10),
    // checkableClaims: z
    //   .array(checkableClaimSchema)
    //   .max(10)
    //   .describe('Specific claims an editor could independently verify.'),
    editorial: z
      .object({
        category: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe('A reader-facing desk or section label.'),
        // newsworthiness: z.enum(['high', 'medium', 'low']),
        // rationale: z.string().trim().min(1).max(500),
        // suggestedFollowUps: z.array(z.string().trim().min(1).max(400)).max(5),
      })
      .strict(),
    // confidence: z
    //   .object({
    //     level: z
    //       .enum(['high', 'medium', 'low'])
    //       .describe(
    //         'Confidence that the briefing faithfully captures the explicit article content, not confidence that the source is true.',
    //       ),
    //     rationale: z
    //       .string()
    //       .trim()
    //       .min(1)
    //       .max(400)
    //       .describe(
    //         'The source-content limitations behind the confidence level.',
    //       ),
    //   })
    //   .strict(),
    caveats: z.array(z.string().trim().min(1).max(400)).max(6),
  })
  .strict()

/** Schema-validated briefing ready for presentation, subject to editorial review. */
export type ArticleBriefing = z.infer<typeof articleBriefingSchema>

/** Browser-safe service failure categories; input-validation/RPC errors are separate. */
export type AnalysisErrorCode =
  | 'CONFIGURATION'
  | 'AUTHENTICATION'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INCOMPLETE_RESPONSE'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_ERROR'
  | 'CANCELLED'

/**
 * Serializable result discriminated by `ok`. Service failures contain safe
 * messages; callers must separately catch validation and transport exceptions.
 */
export type ArticleAnalysisResult =
  | {
      ok: true
      briefing: ArticleBriefing
      metadata: {
        model: string
        articleType: ArticleType
        /** Null when classification fell back, rather than a model confidence estimate. */
        classificationConfidence: number | null
        usedClassificationFallback: boolean
        /** ISO 8601 timestamp recorded after successful briefing generation. */
        analyzedAt: string
        /** Available successful-stage usage only; excludes failed/retried generations. */
        usage: {
          promptTokens: number
          completionTokens: number
          totalTokens: number
        } | null
      }
    }
  | {
      ok: false
      error: {
        code: AnalysisErrorCode
        message: string
        /** Whether a later user-initiated attempt may succeed; not an automatic retry instruction. */
        retryable: boolean
        /** Provider-requested minimum delay before the user should try another submission. */
        retryAfterMs?: number
      }
    }

/** Idempotency key is generated once by the browser and reused after submission network failures. */
export const submitAnalysisSchema = articleAnalysisInputSchema.extend({
  requestId: z.uuid(),
})

/** Only an opaque identifier is placed on the queue; articles remain in the application table. */
export const analysisJobSchema = z.object({ analysisId: z.uuid() }).strict()

/** Status lookup input shared by the browser and server function. */
export const analysisStatusInputSchema = analysisJobSchema

/** Public asynchronous states; pg-boss implementation details are never sent to the browser. */
export type AnalysisStatus =
  | { id: string; state: 'queued' | 'processing' }
  | {
      id: string
      state: 'completed'
      result: Extract<ArticleAnalysisResult, { ok: true }>
    }
  | {
      id: string
      state: 'failed'
      error: Extract<ArticleAnalysisResult, { ok: false }>['error']
    }

/** Browser-safe recent analysis summary; full articles and results are omitted. */
export type AnalysisHistoryItem = {
  id: string
  preview: string
  state: AnalysisStatus['state']
  createdAt: string
  category: string | null
}
