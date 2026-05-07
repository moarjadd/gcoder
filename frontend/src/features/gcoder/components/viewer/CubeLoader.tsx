"use client"
import * as React from "react"

type Props = { className?: string; ariaLabel?: string }

const CubeLoader: React.FC<Props> = ({ className = "w-40 h-40", ariaLabel = "Animación de cubo" }) => (
  <svg viewBox="0 0 128 128" fill="none" role="img" aria-label={ariaLabel} className={className}>
    <use href="#gc_main_cube" x={0} y={0} />

    <defs>
      {/* 👇 variables locales para las caras (derivadas del fondo) */}
      <style>{`
        svg {
          --cube-face-top:   color-mix(in oklch, var(--background) 80%, white 20%);
          --cube-face-mid:   color-mix(in oklch, var(--background) 100%, black 0%);
          --cube-face-front: color-mix(in oklch, var(--background) 70%,  black 30%);
        }
      `}</style>

      {/* contorno (se queda BLANCO) */}
      <g id="gc_cube_outline">
        <path>
          <animate
            attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
            keyTimes="0;0.5;0.5;1"
            keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
            values={`M5 32 L64 0 L123 32 L123 96 L64 128 L5 96Z;
                     M20 10 L108 10 L108 54 L108 118 L20 118 L20 86Z;
                     M108 10 L20 10 L20 54 L20 118 L108 118 L108 86Z;
                     M123 32 L64 0 L5 32 L5 96 L64 128 L123 96Z`}
          />
        </path>
      </g>

      {/* caras (dependen del fondo) */}
      <g id="gc_cube_faces">
        <path>
          <animate
            attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
            values={`M5 32 L64 0 L123 32 L64 64Z;
                     M20 10 L108 10 L108 54 L20 54Z;
                     M64 0 L123 32 L64 64 L5 32Z`}
          />
        </path>
        <path>
          <animate
            attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
            keyTimes="0;0.5;0.5;1"
            keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
            values={`M5 32 L64 64 L64 128 L5 96Z;
                     M20 10 L20 54 L20 118 L20 86Z;
                     M108 10 L108 54 L108 118 L108 86Z;
                     M123 32 L64 64 L64 128 L123 96Z`}
          />
        </path>
        <path>
          <animate
            attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
            values={`M123 32 L64 64 L64 128 L123 96Z;
                     M108 54 L20 54 L20 118 L108 118Z;
                     M64 64 L5 32 L5 96 L64 128Z`}
          />
        </path>
      </g>

      {/* gradiente de las caras: 100% desde --background */}
      <linearGradient id="gc_cubeFill" gradientTransform="rotate(90)">
        <stop  offset="0"   style={{ stopColor: "var(--cube-face-top)"   } as React.CSSProperties} />
        <stop  offset="0.5" style={{ stopColor: "var(--cube-face-mid)"   } as React.CSSProperties} />
        <stop  offset="1"   style={{ stopColor: "var(--cube-face-front)" } as React.CSSProperties} />
      </linearGradient>

      {/* grupo principal */}
      <g id="gc_main_cube">
        {/* caras → gradiente dependiente del fondo */}
        <use href="#gc_cube_faces" fill="url(#gc_cubeFill)" />

        {/* aristas internas → BLANCAS */}
        <g
          id="gc_cube_internal_edges"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.8}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <path>
            <animate attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
              keyTimes="0;0.5;0.5;1"
              keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
              values={`M5 32 L64 64; M20 10 L20 54; M20 54 L108 54; M5 32 L64 64`} />
          </path>
          <path>
            <animate attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
              keyTimes="0;0.5;0.5;1"
              keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
              values={`M123 32 L64 64; M108 54 L20 54; M108 10 L108 54; M123 32 L64 64`} />
          </path>
          <path>
            <animate attributeName="d" dur="2.5s" repeatCount="indefinite" calcMode="spline"
              keyTimes="0;0.5;0.5;1"
              keySplines="0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9; 0.8 0.2 0.6 0.9"
              values={`M64 128 L64 64; M20 118 L20 54; M108 118 L108 54; M64 128 L64 64`} />
          </path>
        </g>

        {/* contorno externo → BLANCO */}
        <use href="#gc_cube_outline" stroke="#FFFFFF" strokeWidth={4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </defs>
  </svg>
)

export default React.memo(CubeLoader)
