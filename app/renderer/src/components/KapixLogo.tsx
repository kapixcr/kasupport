interface Props {
  className?: string;
  size?: number;
}

export function KapixLogo({ className = "w-6 h-6", size = 24 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Degradado principal del cuerpo de la K */}
        <linearGradient id="kapixGrad" x1="15" y1="85" x2="85" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="45%" stopColor="#7c3aed" />
          <stop offset="85%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>

        {/* Degradado para el destello / chispa */}
        <linearGradient id="sparkGrad" x1="70" y1="30" x2="95" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        {/* Brillo sutil */}
        <filter id="glow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#glow)">
        {/* Cuerpo geométrico de la K (estilo Opción 1) */}
        <path
          d="M 22 18 
             L 36 18 
             L 36 44 
             L 66 18 
             L 82 18 
             L 50 49 
             L 84 82 
             L 68 82 
             L 36 54 
             L 36 82 
             L 22 82 
             Z"
          fill="url(#kapixGrad)"
        />

        {/* Corte interior geométrico moderno */}
        <path
          d="M 36 44 L 50 49 L 36 54 Z"
          fill="#4338ca"
          opacity="0.3"
        />

        {/* Destello / Chispa en la punta superior derecha */}
        {/* Rayo vertical */}
        <polygon points="76,11 78,5 80,11 84,13 80,15 78,21 76,15 70,13" fill="url(#sparkGrad)" />
        {/* Rayos diagonales pequeños */}
        <polygon points="86,6 87,3 88,6 91,7 88,8 87,11 86,8 83,7" fill="#38bdf8" opacity="0.9" />
        <polygon points="68,6 69,4 70,6 72,7 70,8 69,10 68,8 66,7" fill="#22d3ee" opacity="0.8" />
      </g>
    </svg>
  );
}
