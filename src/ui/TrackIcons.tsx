// Small inline SVG icons for the track headers (no icon font or emoji, so they render everywhere).
const common = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg {...common}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} />
    </svg>
  );
}

export function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg {...common}>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {hidden && <path d="M2.5 13.5l11-11" />}
    </svg>
  );
}

export function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg {...common}>
      <path d={dir === 'up' ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}
