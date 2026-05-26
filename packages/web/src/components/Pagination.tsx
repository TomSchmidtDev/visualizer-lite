// packages/web/src/components/Pagination.tsx

interface Props {
  page: number
  total: number
  limit: number
  onChange: (page: number) => void
}

export default function Pagination({ page, total, limit, onChange }: Props) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '20px 24px' }}>
      <button
        className="btn btn-secondary"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        style={{ fontSize: 13 }}
      >
        ‹
      </button>
      {Array.from({ length: Math.min(7, pages) }, (_, i) => {
        const p = i + 1
        return (
          <button
            key={p}
            className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onChange(p)}
            style={{ fontSize: 13, minWidth: 36 }}
          >
            {p}
          </button>
        )
      })}
      {pages > 7 && <span style={{ color: 'var(--text-dim)', alignSelf: 'center' }}>…</span>}
      <button
        className="btn btn-secondary"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        style={{ fontSize: 13 }}
      >
        ›
      </button>
    </div>
  )
}
