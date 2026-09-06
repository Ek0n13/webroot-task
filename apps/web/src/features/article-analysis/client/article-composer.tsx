import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ARTICLE_MAX_LENGTH,
  ARTICLE_MIN_LENGTH,
  articleAnalysisInputSchema,
} from '@article/schemas'
import {
  SubmissionError,
  historyOptions,
  statusOptions,
  submissionOptions,
} from './article-analysis.queries'

export function ArticleComposer({
  onSubmitted,
}: {
  onSubmitted: (analysisId: string) => void
}) {
  const queryClient = useQueryClient()
  const [article, setArticle] = useState('')
  const [validationError, setValidationError] = useState('')
  const submission = useMutation({
    ...submissionOptions,
    onSuccess: async (response) => {
      queryClient.setQueryData(statusOptions(response.analysisId).queryKey, {
        ok: true,
        analysis: { id: response.analysisId, state: 'queued' },
      })
      onSubmitted(response.analysisId)
      await queryClient.invalidateQueries({
        queryKey: historyOptions().queryKey,
      })
    },
  })

  const trimmedArticle = article.trim()
  const characterCount = trimmedArticle.length
  const wordCount = trimmedArticle ? trimmedArticle.split(/\s+/).length : 0
  const sourceIsLocked = submission.isPending || submission.isError

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submission.isPending || submission.isSuccess) return

    const parsed = articleAnalysisInputSchema.safeParse({ article })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0].message)
      return
    }

    setValidationError('')
    submission.mutate(
      submission.variables ?? {
        article: parsed.data.article,
        requestId: crypto.randomUUID(),
      },
    )
  }

  function startNewSubmission() {
    const clearArticle = submission.isSuccess
    submission.reset()
    if (clearArticle) setArticle('')
  }

  return (
    <section className="panel composer" aria-labelledby="source-heading">
      <div className="panel-heading">
        <div>
          <span className="step-number">01 / SOURCE</span>
          <h2 id="source-heading">Start with the story</h2>
        </div>
        <span className="text-only-label">TEXT ONLY</span>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="article-text">Article text</label>
        <p className="field-description" id="article-help">
          Paste the full article, including its headline if available.
        </p>
        <textarea
          id="article-text"
          placeholder="Every story has more beneath the headline. Paste yours here..."
          value={article}
          readOnly={sourceIsLocked}
          aria-describedby={`article-help article-count${validationError ? ' article-error' : ''}`}
          aria-invalid={!!validationError}
          onChange={(event) => {
            setArticle(event.target.value)
            setValidationError('')
            submission.reset()
          }}
        />
        <div className="text-stats" id="article-count">
          <span>{wordCount.toLocaleString()} words</span>
          <span
            className={characterCount > ARTICLE_MAX_LENGTH ? 'text-error' : ''}
          >
            {characterCount.toLocaleString()} /{' '}
            {ARTICLE_MAX_LENGTH.toLocaleString()} characters
          </span>
        </div>
        <p className="input-limit">
          {ARTICLE_MIN_LENGTH} characters minimum. No files or links needed.
        </p>
        {validationError && (
          <p id="article-error" className="inline-error" role="alert">
            {validationError}
          </p>
        )}
        {submission.isError && (
          <div className="notice notice-error" role="alert">
            <strong>Submission not confirmed</strong>
            <p>
              {submission.error instanceof SubmissionError
                ? submission.error.message
                : 'The connection was interrupted. Your article may already be queued. Retry safely using the same request ID.'}
            </p>
            <p>
              Your text is locked so a retry cannot change the original request.
            </p>
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
              Submitting article...
            </>
          ) : submission.isError ? (
            'Retry same submission'
          ) : submission.isSuccess ? (
            'Article submitted'
          ) : (
            <>
              Create briefing <span aria-hidden="true">{'↗'}</span>
            </>
          )}
        </button>
        {submission.isSuccess && (
          <p className="submission-confirmation" role="status">
            Article queued. You can leave this tab; the analysis keeps running.
          </p>
        )}
        {(submission.isSuccess || submission.isError) && (
          <button
            className="text-button new-submission"
            type="button"
            onClick={startNewSubmission}
          >
            {submission.isError
              ? 'Start a new submission (may run another analysis)'
              : 'Analyze another article'}
          </button>
        )}
        <div className="privacy-note">
          <span aria-hidden="true">{'↳'}</span>
          <p>
            Text is sent to our AI provider for analysis. Articles and briefings
            are saved for 7 days. Avoid sensitive information.
          </p>
        </div>
      </form>
    </section>
  )
}
