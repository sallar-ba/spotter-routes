const OUTLINE = 'M2 3c5-2 11-2 16 1 5-3 11-3 16-1v15c0 11-7 17-16 21C9 35 2 29 2 18z'
const CROWN = 'M3 4c5-2 10-2 15 1 5-3 10-3 15-1v8H3z'

interface ShieldProps {
  label: string
  muted?: boolean
  className?: string
}

/** Route badge drawn like a US interstate shield. */
export function Shield({ label, muted = false, className = 'size-9' }: ShieldProps) {
  return (
    <svg viewBox="0 0 36 40" className={className} aria-hidden="true">
      <path
        d={OUTLINE}
        fill={muted ? '#8d99a5' : 'var(--color-shield)'}
        stroke="#fff"
        strokeWidth="2"
      />
      <path d={CROWN} fill={muted ? '#6e7a86' : 'var(--color-shield-red)'} />
      <text x="18" y="30.5" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">
        {label}
      </text>
    </svg>
  )
}
