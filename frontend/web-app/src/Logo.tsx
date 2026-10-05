// A plate seen from above, plus the wordmark. `inverse` is for use on the
// terracotta brand panel.
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={inverse ? 'logo inverse' : 'logo'}>
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="logo-tile" />
        <circle cx="16" cy="16" r="9" className="logo-ring" />
        <circle cx="16" cy="16" r="4" className="logo-dot" />
      </svg>
      <span className="logo-word">Table Toronto</span>
    </span>
  )
}
