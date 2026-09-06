import type { ReactNode, RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AnalysisStatus } from '@article/schemas'
import { statusOptions } from './article-analysis.queries'
import { ArticleBriefing } from './article-briefing'
import { StatusBadge } from './analysis-history'

export function AnalysisBriefingPanel({
  analysisId,
  headingRef,
}: {
  analysisId: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  if (!analysisId) {
    return (
      <BriefingPanelShell headingRef={headingRef}>
        <div className="briefing-empty">
          <div className="paper-illustration" aria-hidden="true">
            <span className="paper-kicker" />
            <span className="paper-title" />
            <span />
            <span />
            <span />
            <div>
              <i />
              <i />
              <i />
            </div>
          </div>
          <h3>A fresh perspective starts here.</h3>
          <p>
            Submit an article to turn a long read into a focused editorial
            briefing.
          </p>
          <div className="empty-features">
            <span>Key developments</span>
            <span>People & places</span>
            <span>Claims to check</span>
          </div>
        </div>
      </BriefingPanelShell>
    )
  }

  return <SelectedAnalysis analysisId={analysisId} headingRef={headingRef} />
}

function SelectedAnalysis({
  analysisId,
  headingRef,
}: {
  analysisId: string
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const status = useQuery(statusOptions(analysisId))
  const response = status.data
  const analysis = response?.ok ? response.analysis : undefined
  const active =
    analysis?.state === 'queued' || analysis?.state === 'processing'

  return (
    <BriefingPanelShell
      headingRef={headingRef}
      status={analysis?.state}
      busy={!!active || status.isLoading}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {status.isError
          ? 'Cannot refresh analysis status. Reconnecting automatically; your job is not cancelled.'
          : response && !response.ok
            ? 'This analysis is no longer available.'
            : analysis?.state === 'completed'
              ? 'Briefing ready. Review the AI-generated results below.'
              : analysis?.state === 'failed'
                ? `Analysis failed. ${analysis.error.message}`
                : analysis?.state === 'processing'
                  ? 'Analyzing your article. Progress updates automatically.'
                  : analysis?.state === 'queued'
                    ? 'Your article is queued. Waiting for a worker.'
                    : 'Opening your briefing.'}
      </p>
      {status.isLoading && (
        <div className="briefing-state" role="status">
          <span className="spinner" />
          <h3>Opening your briefing...</h3>
          <p>Retrieving the latest saved status.</p>
        </div>
      )}
      {status.isError && (
        <div className="notice notice-error status-notice" role="alert">
          <strong>We cannot refresh this analysis right now.</strong>
          <p>
            Your job is not cancelled. We will reconnect automatically with a
            slower polling interval.
          </p>
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
          <h3>This analysis is no longer available.</h3>
          <p>It may have expired. Results are kept for 7 days.</p>
        </div>
      )}
      {active && (
        <div className="briefing-state" role="status">
          <span className="spinner large-spinner" aria-hidden="true" />
          <span className="eyebrow">
            {analysis.state === 'queued'
              ? 'Waiting for the worker'
              : 'Reading between the lines'}
          </span>
          <h3>
            {analysis.state === 'queued'
              ? 'Your article is in the queue.'
              : 'Building your briefing.'}
          </h3>
          <p>
            {analysis.state === 'queued'
              ? 'Analysis will begin when a worker is available. You can keep working or return later.'
              : 'Identifying the key developments, mapping the people involved, and surfacing claims worth checking.'}
          </p>
          <p className="section-note">
            Usually about a minute once processing begins. Progress updates
            automatically.
          </p>
          <div className="progress-track">
            <span className="complete">Submitted</span>
            <span className={analysis.state === 'processing' ? 'complete' : ''}>
              Analyzing
            </span>
            <span>Briefing ready</span>
          </div>
        </div>
      )}
      {analysis?.state === 'completed' && (
        <ArticleBriefing result={analysis.result} />
      )}
      {analysis?.state === 'failed' && (
        <div className="briefing-state failed-state" role="alert">
          <span className="eyebrow">
            {analysis.error.code.replaceAll('_', ' ')}
          </span>
          <h3>We couldn't finish this briefing.</h3>
          <p>{analysis.error.message}</p>
          <p className="section-note">
            {analysis.error.retryable
              ? 'You can paste the article and start a new analysis. It is a separate request and may incur another provider charge.'
              : 'This issue may need a configuration change. Contact the app operator before submitting again.'}
          </p>
          {!!analysis.error.retryAfterMs && (
            <p>
              Wait at least {Math.ceil(analysis.error.retryAfterMs / 1000)}{' '}
              seconds after this failure before trying again.
            </p>
          )}
        </div>
      )}
    </BriefingPanelShell>
  )
}

function BriefingPanelShell({
  headingRef,
  status,
  busy = false,
  children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  status?: AnalysisStatus['state']
  busy?: boolean
  children: ReactNode
}) {
  return (
    <section
      className="panel briefing-panel"
      aria-labelledby="briefing-heading"
      aria-busy={busy}
    >
      <div className="panel-heading">
        <div>
          <span className="step-number">02 / BRIEFING</span>
          <h2 id="briefing-heading" ref={headingRef} tabIndex={-1}>
            The story, distilled
          </h2>
        </div>
        {status && <StatusBadge state={status} />}
      </div>
      {children}
    </section>
  )
}
