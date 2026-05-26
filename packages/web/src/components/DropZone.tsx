// packages/web/src/components/DropZone.tsx
import { useRef, useState, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export default function DropZone({ onFile, disabled }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-focus)'}`,
        borderRadius: 12,
        padding: '48px 24px',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        background: dragging ? 'var(--accent-dim)' : 'var(--bg-card)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
        {t('upload.dropHere')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {t('upload.orClick')}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".shot"
        onChange={handleChange}
        style={{ display: 'none' }}
        multiple
      />
    </div>
  )
}
