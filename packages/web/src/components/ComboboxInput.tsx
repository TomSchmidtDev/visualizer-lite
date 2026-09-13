import { useRef, useState } from 'react'

interface ComboboxInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  clearLabel: string
}

function matchesSubstring(candidate: string, query: string): boolean {
  return candidate.toLowerCase().includes(query.toLowerCase())
}

function highlightMatch(text: string, query: string) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <strong>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function ComboboxInput({ id, value, onChange, suggestions, clearLabel }: ComboboxInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const sortedSuggestions = [...suggestions].sort((a, b) => a.localeCompare(b))
  const filtered = value === ''
    ? sortedSuggestions
    : sortedSuggestions.filter((s) => matchesSubstring(s, value))

  const listboxId = `${id}-listbox`
  const optionId = (index: number) => `${id}-option-${index}`

  function selectValue(v: string) {
    onChange(v)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); setHighlightedIndex(-1) }}
        onFocus={() => { setIsOpen(true); setHighlightedIndex(-1) }}
        onBlur={() => { setIsOpen(false); setHighlightedIndex(-1) }}
        autoComplete="off"
        style={{ paddingRight: value ? 28 : undefined }}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label={clearLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); setIsOpen(true); setHighlightedIndex(-1); inputRef.current?.focus() }}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
            fontSize: 14, padding: 4, lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
      {isOpen && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0,
            marginTop: 4, maxHeight: 256, overflowY: 'auto',
            background: 'var(--bg-input)', border: '1px solid var(--border-focus)',
            borderRadius: 'var(--radius)', listStyle: 'none', padding: 4, margin: 0,
          }}
        >
          {filtered.map((item, index) => (
            <li
              key={item}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectValue(item)}
              style={{
                padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                background: index === highlightedIndex ? 'var(--accent-dim)' : 'transparent',
                color: 'var(--text)',
              }}
            >
              {highlightMatch(item, value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
