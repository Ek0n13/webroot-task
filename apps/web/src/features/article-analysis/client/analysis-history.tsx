import { useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { AnalysisHistoryItem } from '@article/schemas'

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

const statusLabels = {
  queued: 'Queued',
  processing: 'Analyzing',
  completed: 'Ready',
  failed: 'Failed',
}

export function StatusBadge({
  state,
}: {
  state: AnalysisHistoryItem['state']
}) {
  return (
    <span className={`status-badge status-${state}`}>
      <span aria-hidden="true" />
      {statusLabels[state]}
    </span>
  )
}

export function AnalysisHistory({
  analyses,
  selectedId,
  onSelect,
}: {
  analyses: Array<AnalysisHistoryItem>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const columns = useMemo<
    Array<ColumnDef<typeof features, AnalysisHistoryItem>>
  >(
    () => [
      {
        accessorKey: 'preview',
        header: 'Article',
        cell: ({ row }) => (
          <button
            className="article-link"
            type="button"
            onClick={() => onSelect(row.original.id)}
            aria-current={selectedId === row.original.id ? 'true' : undefined}
          >
            {row.original.preview}{' '}
            <span className="article-link-hint">
              {selectedId === row.original.id
                ? 'Currently selected'
                : 'Open briefing'}
            </span>
          </button>
        ),
      },
      {
        id: 'state',
        accessorFn: (row) => `${statusLabels[row.state]} ${row.state}`,
        header: 'Status',
        cell: ({ row }) => <StatusBadge state={row.original.state} />,
      },
      {
        accessorKey: 'category',
        header: 'Desk',
        cell: ({ row }) => row.original.category ?? 'Not assigned',
      },
      {
        accessorKey: 'createdAt',
        header: 'Submitted',
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt}>
            {new Date(row.original.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        ),
        enableGlobalFilter: false,
      },
    ],
    [onSelect, selectedId],
  )
  const table = useTable({
    features,
    data: analyses,
    columns,
    state: { globalFilter: filter, sorting },
    onGlobalFilterChange: setFilter,
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
    getRowId: (row) => row.id,
  })
  const pageCount = Math.max(1, table.getPageCount())
  const pageIndex = table.state.pagination.pageIndex
  useEffect(() => {
    if (pageIndex >= pageCount) table.setPageIndex(pageCount - 1)
  }, [pageCount, pageIndex, table])

  return (
    <>
      <div className="history-toolbar">
        <label className="search-label">
          Filter recent analyses
          <input
            type="search"
            placeholder="Search article, status or desk..."
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
              table.setPageIndex(0)
            }}
          />
        </label>
        <span className="muted">
          {table.getFilteredRowModel().rows.length} of {analyses.length}{' '}
          articles
        </span>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Recent analyses table"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Recent submitted articles. Select an article to read its briefing.
          </caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        header.column.getToggleSortingHandler()?.(event)
                        table.setPageIndex(0)
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      <span aria-hidden="true">
                        {header.column.getIsSorted() === 'asc'
                          ? '\u2191'
                          : header.column.getIsSorted() === 'desc'
                            ? '\u2193'
                            : '\u2195'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} data-selected={row.id === selectedId}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!table.getFilteredRowModel().rows.length && (
          <p className="table-empty">
            No analyses match your search. Try a different phrase.
          </p>
        )}
      </div>
      <div className="table-pagination">
        <span>
          Page {pageIndex + 1} of {pageCount}
        </span>
        <div>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}
