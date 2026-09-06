import { useQuery } from '@tanstack/react-query'
import { historyOptions } from './article-analysis.queries'
import { AnalysisHistory } from './analysis-history'

export function AnalysisHistoryPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (analysisId: string) => void
}) {
  const history = useQuery(historyOptions())

  return (
    <section className="panel history-panel" aria-labelledby="history-heading">
      <div className="panel-heading">
        <div>
          <span className="step-number">READING DESK</span>
          <h2 id="history-heading">Recent analyses</h2>
          <p className="section-note">
            Latest 50 submitted articles. Saved for 7 days.
          </p>
        </div>
        <button
          className="button button-quiet"
          type="button"
          disabled={history.isFetching}
          onClick={() => void history.refetch()}
        >
          {history.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {history.isError && (
        <div className="notice notice-error history-notice" role="alert">
          Recent analyses could not be refreshed.{' '}
          {history.data
            ? 'Showing the last loaded list.'
            : 'Saved articles have not been deleted.'}{' '}
          Use Refresh to try again.
        </div>
      )}
      {history.isLoading ? (
        <p className="history-empty" role="status">
          Loading saved analyses...
        </p>
      ) : history.data?.length ? (
        <AnalysisHistory
          analyses={history.data}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        !history.isError && (
          <div className="history-empty">
            <h3>The reading desk is clear.</h3>
            <p>
              Submit your first article above. Its briefing will be saved here,
              ready to revisit.
            </p>
          </div>
        )
      )}
    </section>
  )
}
