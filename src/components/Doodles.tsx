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

export function DoodleDecor({ className }: { className?: string }) {
  return (
    <div className={`doodle-decor ${className || ""}`} aria-hidden="true">
      <CrayonKid size={72} className="doodle-decor-mascot" />
      <svg className="doodle-decor-sun" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="14" fill="#ffcf3f" stroke="#3d2f26" strokeWidth="3" />
        <path d="M32 8 V18 M32 46 V56 M8 32 H18 M46 32 H56 M14 14 L21 21 M43 43 L50 50 M50 14 L43 21 M21 43 L14 50" stroke="#3d2f26" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <svg className="doodle-decor-star" viewBox="0 0 40 40">
        <path d="M20 4 L24 15 L36 16 L27 24 L30 36 L20 29 L10 36 L13 24 L4 16 L16 15 Z" fill="#e8463a" stroke="#3d2f26" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <svg className="doodle-decor-crayon" viewBox="0 0 44 84">
        <path d="M12 12 L32 12 L36 28 L34 80 L10 80 L8 28 Z" fill="#3b82f6" stroke="#3d2f26" strokeWidth="3" strokeLinejoin="round" />
        <path d="M10 12 L34 12 L36 28 L8 28 Z" fill="#9fe28c" stroke="#3d2f26" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M14 62 L16 36 M22 62 L24 36 M30 62 L32 36" stroke="#3d2f26" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
      <svg className="doodle-decor-cloud" viewBox="0 0 80 50">
        <path d="M18 44 Q8 44 8 34 Q8 25 18 24 Q20 12 34 12 Q48 12 52 22 Q64 22 64 34 Q64 44 54 44 Z" fill="#fffdf7" stroke="#3d2f26" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <svg className="doodle-decor-scribble" viewBox="0 0 90 30">
        <path d="M6 16 Q16 6 26 16 Q36 26 46 16 Q56 6 66 16 Q76 26 86 14" stroke="#3d2f26" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
