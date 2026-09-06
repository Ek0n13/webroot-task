import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnalysisBriefingPanel } from './analysis-briefing-panel'
import { AnalysisHistoryPanel } from './analysis-history-panel'
import { ArticleComposer } from './article-composer'
import { statusOptions } from './article-analysis.queries'

export function ArticleWorkspace() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const briefingHeading = useRef<HTMLHeadingElement>(null)

  function selectAnalysis(analysisId: string) {
    void queryClient.query(statusOptions(analysisId)).catch(() => undefined)
    setSelectedId(analysisId)
    briefingHeading.current?.focus({ preventScroll: true })
    briefingHeading.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            m.
          </span>
          <span>
            margin<span className="brand-descriptor">ARTICLE INTELLIGENCE</span>
          </span>
        </div>
        <span className="masthead-note">Less noise. More context.</span>
      </header>

      <main id="workspace">
        <div className="page-intro">
          <div>
            <p className="eyebrow">The editorial workspace</p>
            <h1>From article to insight.</h1>
            <p>Find the story, surface the details, know what to check next.</p>
          </div>
          <div className="intro-note">
            <span className="small-dot" />
            Built for a closer read<span>AI-assisted. Editor-led.</span>
          </div>
        </div>

        <div className="workspace-grid">
          <ArticleComposer onSubmitted={selectAnalysis} />
          <AnalysisBriefingPanel
            analysisId={selectedId}
            headingRef={briefingHeading}
          />
        </div>

        <AnalysisHistoryPanel
          selectedId={selectedId}
          onSelect={selectAnalysis}
        />
      </main>
      <footer className="site-footer">
        <span>margin / Article intelligence</span>
        <p>
          A starting point for good journalism. Not a substitute for
          verification.
        </p>
      </footer>
    </div>
  )
}
