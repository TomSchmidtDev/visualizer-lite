// packages/web/src/components/TastingScores.tsx
import type { Shot } from '../types.js'

type ScoreField = keyof Pick<Shot,
  'fragrance' | 'aroma' | 'flavor' | 'aftertaste' |
  'acidity' | 'bitterness' | 'sweetness' | 'mouthfeel'
>

const FIELDS: ScoreField[] = [
  'fragrance', 'aroma', 'flavor', 'aftertaste',
  'acidity', 'bitterness', 'sweetness', 'mouthfeel',
]

interface Props {
  shot: Shot
}

export default function TastingScores({ shot }: Props) {
  const hasAny = FIELDS.some((f) => shot[f] != null)
  if (!hasAny) return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>—</p>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {FIELDS.map((f) => {
        const val = shot[f]
        if (val == null) return null
        return (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 70, flexShrink: 0, textTransform: 'capitalize' }}>
              {f}
            </span>
            <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(val / 10) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, width: 20, textAlign: 'right' }}>
              {val}
            </span>
          </div>
        )
      })}
    </div>
  )
}
