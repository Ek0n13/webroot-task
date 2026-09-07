import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ARTICLE_MAX_LENGTH,
  ARTICLE_MIN_LENGTH,
  articleComparisonInputSchema,
} from '@article/schemas'
import {
  ComparisonSubmissionError,
  comparisonStatusOptions,
  comparisonSubmissionOptions,
} from './article-comparison.queries'

type ArticleKey = 'articleA' | 'articleB'

export function ComparisonComposer({
  onSubmitted,
}: {
  onSubmitted: (comparisonId: string) => void
}) {
  const queryClient = useQueryClient()
  const [articles, setArticles] = useState({ articleA: '', articleB: '' })
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<ArticleKey, string>>
  >({})
  const submission = useMutation({
    ...comparisonSubmissionOptions,
    onSuccess: (response) => {
      queryClient.setQueryData(
        comparisonStatusOptions(response.comparisonId).queryKey,
        {
          ok: true,
          comparison: { id: response.comparisonId, state: 'queued' },
        },
      )
      onSubmitted(response.comparisonId)
    },
  })
  const sourceIsLocked = submission.isPending || submission.isError

  function updateArticle(key: ArticleKey, value: string) {
    setArticles((current) => ({ ...current, [key]: value }))
    setValidationErrors((current) => ({ ...current, [key]: undefined }))
    submission.reset()
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submission.isPending || submission.isSuccess) return

    const parsed = articleComparisonInputSchema.safeParse(articles)
    if (!parsed.success) {
      const errors: Partial<Record<ArticleKey, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if ((key === 'articleA' || key === 'articleB') && !errors[key]) {
          errors[key] = issue.message
        }
      }
      setValidationErrors(errors)
      return
    }

    setValidationErrors({})
    submission.mutate(
      submission.variables ?? {
        ...parsed.data,
        requestId: crypto.randomUUID(),
      },
    )
  }

  function startNewComparison() {
    const clearArticles = submission.isSuccess
    submission.reset()
    if (clearArticles) setArticles({ articleA: '', articleB: '' })
  }

  return (
    <section
      className="panel composer comparison-composer"
      aria-labelledby="comparison-source-heading"
    >
      <div className="panel-heading">
        <div>
          <span className="step-number">01 / SOURCES</span>
          <h2 id="comparison-source-heading">Put two stories side by side</h2>
        </div>
        <span className="text-only-label">TEXT ONLY</span>
      </div>
      <form onSubmit={submit}>
        <ComparisonTextArea
          articleKey="articleA"
          label="Article A"
          value={articles.articleA}
          error={validationErrors.articleA}
          readOnly={sourceIsLocked}
          onChange={updateArticle}
        />
        <ComparisonTextArea
          articleKey="articleB"
          label="Article B"
          value={articles.articleB}
          error={validationErrors.articleB}
          readOnly={sourceIsLocked}
          onChange={updateArticle}
        />
        {submission.isError && (
          <div className="notice notice-error" role="alert">
            <strong>Submission not confirmed</strong>
            <p>
              {submission.error instanceof ComparisonSubmissionError
                ? submission.error.message
                : 'The connection was interrupted. Your comparison may already be queued.'}
            </p>
            <p>The sources are locked so a retry cannot change this job.</p>
          </div>
        )}
        <button
          className="button button-primary submit-button"
          type="submit"
          disabled={submission.isPending || submission.isSuccess}
        >
          {submission.isPending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Submitting comparison...
            </>
          ) : submission.isError ? (
            'Retry same comparison'
          ) : submission.isSuccess ? (
            'Comparison submitted'
          ) : (
            <>
              Compare articles <span aria-hidden="true">{'↗'}</span>
            </>
          )}
        </button>
        {submission.isSuccess && (
          <p className="submission-confirmation" role="status">
            Comparison queued. Keep this tab open to retrieve its temporary
            result.
          </p>
        )}
        {(submission.isSuccess || submission.isError) && (
          <button
            className="text-button new-submission"
            type="button"
            onClick={startNewComparison}
          >
            {submission.isError
              ? 'Start a new comparison (may create another job)'
              : 'Compare another pair'}
          </button>
        )}
        <div className="privacy-note">
          <span aria-hidden="true">{'↳'}</span>
          <p>
            Sources and output are stored only in the temporary worker job, not
            in the application's analysis table. Avoid sensitive information.
          </p>
        </div>
      </form>
    </section>
  )
}

function ComparisonTextArea({
  articleKey,
  label,
  value,
  error,
  readOnly,
  onChange,
}: {
  articleKey: ArticleKey
  label: string
  value: string
  error?: string
  readOnly: boolean
  onChange: (key: ArticleKey, value: string) => void
}) {
  const id = `comparison-${articleKey}`
  const trimmed = value.trim()
  const characterCount = trimmed.length
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0

  return (
    <div className="comparison-source-field">
      <label htmlFor={id}>{label}</label>
      <p className="field-description" id={`${id}-help`}>
        Paste the full source, including its headline when available.
      </p>
      <textarea
        id={id}
        placeholder={`Paste ${label} here...`}
        value={value}
        readOnly={readOnly}
        aria-describedby={`${id}-help ${id}-count${error ? ` ${id}-error` : ''}`}
        aria-invalid={!!error}
        onChange={(event) => onChange(articleKey, event.target.value)}
      />
      <div className="text-stats" id={`${id}-count`}>
        <span>{wordCount.toLocaleString()} words</span>
        <span
          className={characterCount > ARTICLE_MAX_LENGTH ? 'text-error' : ''}
        >
          {characterCount.toLocaleString()} /{' '}
          {ARTICLE_MAX_LENGTH.toLocaleString()} characters
        </span>
      </div>
      <p className="input-limit">{ARTICLE_MIN_LENGTH} characters minimum.</p>
      {error && (
        <p id={`${id}-error`} className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
