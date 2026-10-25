interface EndpointDotProps {
  kind: 'origin' | 'destination'
  className?: string
}

/** Origin is a ring, destination a filled dot: the same marks on the map, the form and the summary. */
export function EndpointDot({ kind, className = 'size-3.5' }: EndpointDotProps) {
  const style =
    kind === 'origin' ? 'border-ink bg-surface' : 'border-surface bg-ink ring-1 ring-ink'
  return (
    <span aria-hidden="true" className={`block rounded-full border-[3px] ${style} ${className}`} />
  )
}
