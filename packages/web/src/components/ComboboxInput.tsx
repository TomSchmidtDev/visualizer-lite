// packages/web/src/components/ComboboxInput.tsx
import { useRef, useState, type KeyboardEvent } from 'react'

interface ComboboxInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  clearLabel: string
}

function matchesPrefix(candidate: string, query: string): boolean {
  return candidate.toLowerCase().startsWith(query.toLowerCase())
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
  const [isFocused, setIsFocused] = useState(false)
  const focusValueRef = useRef(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const sortedSuggestions = [...suggestions].sort((a, b) => a.localeCompare(b))
  const filtered = value === ''
    ? sortedSuggestions
    : sortedSuggestions.filter((s) => matchesSubstring(s, value))
  const ghostMatch = value !== ''
    ? sortedSuggestions.find((s) => matchesPrefix(s, value) && s.toLowerCase() !== value.toLowerCase())
    : undefined
  const ghostTail = ghostMatch ? ghostMatch.slice(value.length) : ''

  const listboxId = `${id}-listbox`
  const optionId = (index: number) => `${id}-option-${index}`

  function selectValue(v: string) {
    onChange(v)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowRight') {
      const input = inputRef.current
      const atEnd = !!input && input.selectionStart === value.length && input.selectionEnd === value.length
      if (atEnd && ghostMatch && ghostTail) {
        e.preventDefault()
        onChange(ghostMatch)
        setIsOpen(true)
        setHighlightedIndex(-1)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setHighlightedIndex(0)
        return
      }
      setHighlightedIndex((i) => (filtered.length === 0 ? -1 : Math.min(i + 1, filtered.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) return
      setHighlightedIndex((i) => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        e.preventDefault()
        selectValue(filtered[highlightedIndex])
      } else {
        if (isOpen) e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
      return
    }
    if (e.key === 'Escape') {
      onChange(focusValueRef.current)
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-input)',
          border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--border-focus)'}`,
          borderRadius: 'var(--radius)',
        }}
      >
        {ghostTail && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)',
              pointerEvents: 'none', whiteSpace: 'pre', color: 'var(--text-dim)',
            }}
          >
            <span style={{ visibility: 'hidden' }}>{value}</span>
            <span data-testid="ghost-tail">{ghostTail}</span>
          </div>
        )}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="both"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
          value={value}
          onChange={(e) => { onChange(e.target.value); setIsOpen(true); setHighlightedIndex(-1) }}
          onFocus={() => { setIsFocused(true); focusValueRef.current = value; setIsOpen(true); setHighlightedIndex(-1) }}
          onBlur={() => { setIsFocused(false); setIsOpen(false); setHighlightedIndex(-1) }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{ position: 'relative', background: 'transparent', border: 'none', outline: 'none', paddingRight: value ? 28 : undefined }}
        />
      </div>
      {value !== '' && (
        <button
          type="button"
          aria-label={clearLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); setIsOpen(true); setHighlightedIndex(-1); inputRef.current?.focus() }}
          style={{
            position: 'absolute', zIndex: 2, right: 6, top: '50%', transform: 'translateY(-50%)',
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
            borderRadius: 'var(--radius)', listStyle: 'none', padding: 4,
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
