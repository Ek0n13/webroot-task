import type { ArticleComparisonResult } from '@article/schemas'

export function ComparisonResult({
  result,
}: {
  result: Extract<ArticleComparisonResult, { ok: true }>
}) {
  const { comparison, metadata } = result
  return (
    <div className="briefing-content comparison-content">
      <div className="briefing-meta">
        <span className="tag category-tag">Direct comparison</span>
        <span className="eyebrow">AI-generated / Review against sources</span>
      </div>
      <section aria-labelledby="comparison-conclusion-heading">
        <h3 id="comparison-conclusion-heading" className="section-label">
          Conclusion
        </h3>
        <p className="briefing-summary">{comparison.conclusion}</p>
      </section>
      <ComparisonPoints
        heading="Similarities"
        headingId="similarities-heading"
        empty="No material similarities were supported by both sources."
        points={comparison.similarities}
      />
      <ComparisonPoints
        heading="Differences"
        headingId="differences-heading"
        empty="No material differences were supported by the sources."
        points={comparison.differences}
      />
      <section aria-labelledby="comparison-caveats-heading">
        <h3 id="comparison-caveats-heading" className="section-label">
          Caveats
        </h3>
        {comparison.caveats.length ? (
          <ul className="plain-list">
            {comparison.caveats.map((caveat, index) => (
              <li key={index}>{caveat}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No additional comparison limitations were identified.
          </p>
        )}
      </section>
      <details className="analysis-details">
        <summary>Comparison details</summary>
        <dl>
          <div>
            <dt>Model</dt>
            <dd>{metadata.model}</dd>
          </div>
          <div>
            <dt>Compared</dt>
            <dd>{new Date(metadata.comparedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Reported tokens</dt>
            <dd>
              {metadata.usage?.totalTokens.toLocaleString() ?? 'Unavailable'}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

function ComparisonPoints({
  heading,
  headingId,
  empty,
  points,
}: {
  heading: string
  headingId: string
  empty: string
  points: Array<{ point: string; articleA: string; articleB: string }>
}) {
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="section-label">
        {heading} <span className="count">{points.length}</span>
      </h3>
      {points.length ? (
        <ol className="comparison-points">
          {points.map((point, index) => (
            <li key={index}>
              <h4>{point.point}</h4>
              <div className="comparison-sources">
                <div>
                  <span className="source-label">Article A</span>
                  <p>{point.articleA}</p>
                </div>
                <div>
                  <span className="source-label">Article B</span>
                  <p>{point.articleB}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  )
}
