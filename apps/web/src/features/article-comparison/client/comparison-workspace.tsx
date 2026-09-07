import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { comparisonStatusOptions } from './article-comparison.queries'
import { ComparisonComposer } from './comparison-composer'
import { ComparisonPanel } from './comparison-panel'

export function ComparisonWorkspace() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)

  function selectComparison(comparisonId: string) {
    void queryClient
      .query(comparisonStatusOptions(comparisonId))
      .catch(() => undefined)
    setSelectedId(comparisonId)
    resultHeading.current?.focus({ preventScroll: true })
    resultHeading.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="workspace-grid comparison-workspace">
      <ComparisonComposer onSubmitted={selectComparison} />
      <ComparisonPanel comparisonId={selectedId} headingRef={resultHeading} />
    </div>
  )
}
