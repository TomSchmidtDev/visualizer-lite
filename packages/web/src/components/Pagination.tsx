// packages/web/src/components/Pagination.tsx

interface Props {
  page: number
  total: number
  limit: number
  onChange: (page: number) => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

export default function Pagination({ page, total, limit, onChange, scrollRef }: Props) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null

  // Show a window of up to 5 page numbers centred on the current page
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  const start = Math.max(1, Math.min(page - half, pages - windowSize + 1))
  const end   = Math.min(pages, start + windowSize - 1)
  const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const btn = (label: string, target: number, disabled: boolean, active = false) => (
    <button
      key={label}
      className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => onChange(target)}
      disabled={disabled}
      style={{ fontSize: 13, minWidth: 36 }}
    >
      {label}
    </button>
  )

  return (
    <div ref={scrollRef} style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '20px 24px', flexWrap: 'wrap' }}>
      {btn('«', 1,     page <= 1)}
      {btn('‹', Math.max(1, page - 10), page <= 1)}
      {start > 1 && <span style={{ color: 'var(--text-dim)', alignSelf: 'center', fontSize: 13 }}>…</span>}
      {pageNums.map((p) => btn(String(p), p, false, p === page))}
      {end < pages && <span style={{ color: 'var(--text-dim)', alignSelf: 'center', fontSize: 13 }}>…</span>}
      {btn('›', Math.min(pages, page + 10), page >= pages)}
      {btn('»', pages,  page >= pages)}
    </div>
  )
}
