import type { ReactNode, RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ComparisonStatus } from '@article/schemas'
import { StatusBadge } from '../../article-analysis/client/analysis-history'
import { comparisonStatusOptions } from './article-comparison.queries'
import { ComparisonResult } from './comparison-result'

export function ComparisonPanel({
  comparisonId,
  headingRef,
}: {
  comparisonId: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  if (!comparisonId) {
    return (
      <ComparisonPanelShell headingRef={headingRef}>
        <div className="briefing-empty comparison-empty">
          <div className="comparison-illustration" aria-hidden="true">
            <span>A</span>
            <i />
            <span>B</span>
          </div>
          <h3>See where the stories meet—and part.</h3>
          <p>
            Submit two articles to surface their material overlap, differences,
            and an editorial conclusion.
          </p>
          <div className="empty-features">
            <span>Shared points</span>
            <span>Key differences</span>
            <span>Conclusion</span>
          </div>
        </div>
      </ComparisonPanelShell>
    )
  }

  return (
    <SelectedComparison comparisonId={comparisonId} headingRef={headingRef} />
  )
}

function SelectedComparison({
  comparisonId,
  headingRef,
}: {
  comparisonId: string
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const status = useQuery(comparisonStatusOptions(comparisonId))
  const response = status.data
  const comparison = response?.ok ? response.comparison : undefined
  const active =
    comparison?.state === 'queued' || comparison?.state === 'processing'

  return (
    <ComparisonPanelShell
      headingRef={headingRef}
      status={comparison?.state}
      busy={!!active || status.isLoading}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {status.isError
          ? 'Cannot refresh comparison status. Reconnecting automatically.'
          : response && !response.ok
            ? 'This comparison is no longer available.'
            : comparison?.state === 'completed'
              ? 'Comparison ready. Review the AI-generated result below.'
              : comparison?.state === 'failed'
                ? `Comparison failed. ${comparison.error.message}`
                : comparison?.state === 'processing'
                  ? 'Comparing both articles. Progress updates automatically.'
                  : comparison?.state === 'queued'
                    ? 'Your comparison is queued. Waiting for a worker.'
                    : 'Opening your comparison.'}
      </p>
      {status.isLoading && (
        <div className="briefing-state" role="status">
          <span className="spinner" />
          <h3>Opening your comparison...</h3>
          <p>Retrieving the temporary worker job.</p>
        </div>
      )}
      {status.isError && (
        <div className="notice notice-error status-notice" role="alert">
          <strong>We cannot refresh this comparison right now.</strong>
          <p>The job is not cancelled. We will reconnect automatically.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => void status.refetch()}
            disabled={status.isFetching}
          >
            Check again
          </button>
        </div>
      )}
      {response && !response.ok && !status.isError && (
        <div className="briefing-state">
          <h3>This comparison is no longer available.</h3>
          <p>The temporary pg-boss job may have expired.</p>
        </div>
      )}
      {active && (
        <div className="briefing-state" role="status">
          <span className="spinner large-spinner" aria-hidden="true" />
          <span className="eyebrow">
            {comparison.state === 'queued'
              ? 'Waiting for the worker'
              : 'Reading both stories'}
          </span>
          <h3>
            {comparison.state === 'queued'
              ? 'Your articles are in the queue.'
              : 'Building the comparison.'}
          </h3>
          <p>
            {comparison.state === 'queued'
              ? 'Comparison will begin when a worker is available.'
              : 'Finding shared claims, meaningful differences, and source limitations in one pass.'}
          </p>
          <div className="progress-track">
            <span className="complete">Submitted</span>
            <span
              className={comparison.state === 'processing' ? 'complete' : ''}
            >
              Comparing
            </span>
            <span>Conclusion ready</span>
          </div>
        </div>
      )}
      {comparison?.state === 'completed' && (
        <ComparisonResult result={comparison.result} />
      )}
      {comparison?.state === 'failed' && (
        <div className="briefing-state failed-state" role="alert">
          <span className="eyebrow">
            {comparison.error.code.replaceAll('_', ' ')}
          </span>
          <h3>We couldn't finish this comparison.</h3>
          <p>{comparison.error.message}</p>
          <p className="section-note">
            {comparison.error.retryable
              ? 'You can start a new comparison. It may incur another provider charge.'
              : 'This issue requires a configuration change before trying again.'}
          </p>
        </div>
      )}
    </ComparisonPanelShell>
  )
}

function ComparisonPanelShell({
  headingRef,
  status,
  busy = false,
  children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  status?: ComparisonStatus['state']
  busy?: boolean
  children: ReactNode
}) {
  return (
    <section
      className="panel briefing-panel comparison-panel"
      aria-labelledby="comparison-heading"
      aria-busy={busy}
    >
      <div className="panel-heading">
        <div>
          <span className="step-number">02 / COMPARISON</span>
          <h2 id="comparison-heading" ref={headingRef} tabIndex={-1}>
            The stories, compared
          </h2>
        </div>
        {status && <StatusBadge state={status} />}
      </div>
      {children}
    </section>
  )
}
