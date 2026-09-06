import { createFileRoute } from '@tanstack/react-router'
import { ArticleWorkspace } from '../features/article-analysis/client/article-workspace'
import { historyOptions } from '../features/article-analysis/client/article-analysis.queries'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient
      .query(historyOptions())
      .then(() => undefined)
      .catch(() => undefined),
  component: Home,
})

function Home() {
  return <ArticleWorkspace />
}
