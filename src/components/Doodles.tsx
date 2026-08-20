interface DoodleProps {
  size?: number;
  className?: string;
}

export function CrayonKid({ size = 120, className }: DoodleProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 160"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
    >
      <g stroke="#3d2f26" strokeWidth="4" strokeLinecap="round">
        <path d="M16 24 v-9 M28 18 v-11 M40 24 v-9" />
      </g>
      <circle cx="28" cy="30" r="13" fill="#ffcf3f" stroke="#3d2f26" strokeWidth="4" />
      <path
        d="M20 105 Q42 90 64 103 Q86 116 108 100 Q128 86 142 98"
        stroke="#3d2f26"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <path
        d="M46 62 Q48 32 80 32 Q112 32 114 62 Q108 46 95 49 Q101 34 80 35 Q59 34 65 49 Q52 46 46 62 Z"
        fill="#3b2b24"
        stroke="#3d2f26"
        strokeWidth="3"
      />
      <ellipse cx="80" cy="74" rx="34" ry="36" fill="#ffd9b3" stroke="#3d2f26" strokeWidth="4" />
      <path d="M62 64 Q72 57 82 64" stroke="#3b2b24" strokeWidth="6" strokeLinecap="round" />
      <path d="M98 64 Q108 57 118 64" stroke="#3b2b24" strokeWidth="6" strokeLinecap="round" />
      <circle cx="70" cy="76" r="3.6" fill="#3b2b24" />
      <circle cx="100" cy="76" r="3.6" fill="#3b2b24" />
      <path d="M78 90 Q85 95 92 90" stroke="#3b2b24" strokeWidth="3" strokeLinecap="round" />
      <path d="M52 102 L108 102 L116 150 L44 150 Z" fill="#e8463a" stroke="#3d2f26" strokeWidth="4" strokeLinejoin="round" />
      <path d="M68 102 L80 116 L92 102" fill="#fffdf7" stroke="#3d2f26" strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 150 L52 132 L108 132 L116 150 Z" fill="#ffcf3f" stroke="#3d2f26" strokeWidth="4" strokeLinejoin="round" />
      <path d="M54 124 Q44 116 36 120" stroke="#3d2f26" strokeWidth="6" strokeLinecap="round" />
      <rect x="28" y="100" width="10" height="42" rx="4" fill="#3b82f6" stroke="#3d2f26" strokeWidth="3" transform="rotate(-18 33 121)" />
      <path d="M24 98 Q18 96 18 90" stroke="#3d2f26" strokeWidth="4" strokeLinecap="round" />
      <path d="M108 130 L132 124" stroke="#3d2f26" strokeWidth="6" strokeLinecap="round" />
      <circle cx="132" cy="124" r="4" fill="#e8463a" stroke="#3d2f26" strokeWidth="2" />
    </svg>
  );
}

export function CrayonStripe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 24" width="80" height="24" aria-hidden="true">
      <path d="M6 12 Q14 6 22 12 Q30 18 38 12 Q46 6 54 12 Q62 18 70 12 Q74 9 76 8" fill="none" stroke="#3d2f26" strokeWidth="3" strokeLinecap="round" />
      <circle cx="8" cy="19" r="2.5" fill="#ffcf3f" stroke="#3d2f26" strokeWidth="1.5" />
      <circle cx="72" cy="5" r="2.5" fill="#e8463a" stroke="#3d2f26" strokeWidth="1.5" />
    </svg>
  );
}
