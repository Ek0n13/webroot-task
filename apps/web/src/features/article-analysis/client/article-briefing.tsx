import type { ArticleAnalysisResult } from '@article/schemas'

export function ArticleBriefing({
  result,
}: {
  result: Extract<ArticleAnalysisResult, { ok: true }>
}) {
  const { briefing, metadata } = result
  return (
    <div className="briefing-content">
      <div className="briefing-meta">
        <span className="tag category-tag">{briefing.editorial.category}</span>
        <span className="eyebrow">AI-generated / Review before publishing</span>
      </div>
      <section aria-labelledby="summary-heading">
        <h3 id="summary-heading" className="section-label">
          The short version
        </h3>
        <p className="briefing-summary">{briefing.summary}</p>
      </section>

      <section aria-labelledby="developments-heading">
        <h3 id="developments-heading" className="section-label">
          Key developments
        </h3>
        {briefing.keyDevelopments.length ? (
          <ol className="developments">
            {briefing.keyDevelopments.map((point, index) => (
              <li key={index}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p>{point}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            No distinct developments identified in the source.
          </p>
        )}
      </section>

      <section aria-labelledby="topics-heading">
        <h3 id="topics-heading" className="section-label">
          Topics
        </h3>
        {briefing.topics.length ? (
          <ul className="tags">
            {briefing.topics.map((topic, index) => (
              <li className="tag" key={index}>
                {topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No specific topics identified.</p>
        )}
      </section>

      <section aria-labelledby="entities-heading">
        <h3 id="entities-heading" className="section-label">
          People, places & organisations{' '}
          <span className="count">{briefing.entities.length}</span>
        </h3>
        {briefing.entities.length ? (
          <ul className="entity-list">
            {briefing.entities.map((entity, index) => (
              <li key={index}>
                <div>
                  <strong>{entity.name}</strong>
                  <span className="entity-type">{entity.type}</span>
                </div>
                <p>{entity.relevance}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No relevant entities identified in the source.
          </p>
        )}
      </section>

      {/* <section aria-labelledby="claims-heading">
        <h3 id="claims-heading" className="section-label">
          Claims to check{' '}
          <span className="count">{briefing.checkableClaims.length}</span>
        </h3>
        <p className="section-note">
          A verification checklist, not a list of verified facts.
        </p>
        {briefing.checkableClaims.length ? (
          <ul className="claim-list">
            {briefing.checkableClaims.map((claim, index) => (
              <li key={index}>
                <span
                  className={`priority priority-${claim.verificationPriority}`}
                >
                  {claim.verificationPriority} priority
                </span>
                <p>{claim.claim}</p>
                <small>
                  Attribution:{' '}
                  {claim.attribution ?? 'Not specified in the article'}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No specific checkable claims identified. This does not establish the
            article's accuracy.
          </p>
        )}
      </section>

      <section className="editorial-note" aria-labelledby="editorial-heading">
        <h3 id="editorial-heading" className="section-label">
          Editor's notebook
        </h3>
        <p>
          <strong className="capitalize">
            {briefing.editorial.newsworthiness} newsworthiness.
          </strong>{' '}
          {briefing.editorial.rationale}
        </p>
        <h4>Suggested follow-ups</h4>
        {briefing.editorial.suggestedFollowUps.length ? (
          <ul className="plain-list">
            {briefing.editorial.suggestedFollowUps.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No follow-ups suggested.</p>
        )}
      </section>

      <section className="confidence-note" aria-labelledby="confidence-heading">
        <h3 id="confidence-heading" className="section-label">
          Confidence & limitations
        </h3>
        <p>
          <strong className="capitalize">
            {briefing.confidence.level} source fidelity.
          </strong>{' '}
          {briefing.confidence.rationale}
        </p>
        <p className="section-note">
          Confidence describes how well the briefing reflects the text, not
          whether the source is true.
        </p>
        {briefing.caveats.length ? (
          <ul className="plain-list">
            {briefing.caveats.map((caveat, index) => (
              <li key={index}>{caveat}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No additional caveats returned. Independent review is still needed.
          </p>
        )}
      </section> */}

      <details className="analysis-details">
        <summary>Analysis details</summary>
        <dl>
          <div>
            <dt>Model</dt>
            <dd>{metadata.model}</dd>
          </div>
          <div>
            <dt>Editorial lens</dt>
            <dd>{metadata.articleType.replaceAll('-', ' ')}</dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>
              {metadata.usedClassificationFallback
                ? 'General lens fallback used'
                : metadata.classificationConfidence === null
                  ? 'Confidence unavailable'
                  : `${Math.round(metadata.classificationConfidence * 100)}% model self-assessment`}
            </dd>
          </div>
          <div>
            <dt>Analyzed</dt>
            <dd>{new Date(metadata.analyzedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Reported tokens</dt>
            <dd>
              {metadata.usage?.totalTokens.toLocaleString() ?? 'Unavailable'}{' '}
              (successful stages only)
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}
