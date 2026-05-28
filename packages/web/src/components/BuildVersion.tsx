// packages/web/src/components/BuildVersion.tsx
export default function BuildVersion() {
  const parts = [`v${__APP_VERSION__}`]
  if (__GIT_HASH__) parts.push(__GIT_HASH__)
  parts.push(__BUILD_TIME__)

  return (
    <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.45, fontVariantNumeric: 'tabular-nums' }}>
      {parts.join(' · ')}
    </span>
  )
}
