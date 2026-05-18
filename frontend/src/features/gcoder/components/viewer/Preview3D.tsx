"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Rotate3D,
  RefreshCcw,
} from "lucide-react"
import { cn } from "@/lib/cn"
import CubeLoader from "@/features/gcoder/components/viewer/CubeLoader"

type Props = {
  data?: ArrayBuffer
  canExpand: boolean
  isConverting: boolean
  isExpanded: boolean
  onToggleExpandAndGenerate: () => void
  className?: string
  modelRotation?: { x: number; y: number; z: number }
  rotateModel?: (axis: "x" | "y" | "z", degrees: number) => void
  modelScale?: number
  onScaleChange?: (scale: number) => void
  onResetTransform?: () => void
  dimensions?: { x: number; y: number; z: number } | null
  onDimensionsChange?: (dimensions: { x: number; y: number; z: number }) => void
  isModelModified?: boolean
  isModelLocked?: boolean
  isAnalyzed?: boolean
}

// Lazy load del visor
const StlViewer = dynamic(() => import("@/features/gcoder/components/viewer/StlViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center">
      <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
    </div>
  ),
})

function Preview3DBase({
  data,
  canExpand,
  isConverting,
  isExpanded,
  onToggleExpandAndGenerate,
  className,
  modelRotation,
  rotateModel,
  modelScale = 1,
  onScaleChange,
  onResetTransform,
  dimensions,
  onDimensionsChange,
  isModelModified,
  isModelLocked,
  isAnalyzed,
}: Props) {
  const transformsDisabled = isConverting || Boolean(isModelLocked)
  const viewerProps = React.useMemo(
    () => ({
      data,
      color: "#22c55e",
      wireframe: false,
      zUp: true,
      autoRotate: false,
      modelRotation,
      uniformScale: modelScale,
      onDimensionsChange,
    }),
    [data, modelRotation, modelScale, onDimensionsChange],
  )

  const label = isExpanded ? "Contraer vista 3D" : "Expandir y generar G-code"
  const title = isConverting ? "Procesando…" : label

  return (
    <div
      className={cn(
        "border border-border rounded-lg bg-muted/30 relative flex flex-col overflow-hidden",
        className,
      )}
    >
      {/* Lienzo */}
      <div className="flex-1 relative min-h-0">
        <StlViewer {...viewerProps} />
      </div>

      {/* Overlay cuando NO hay STL */}
      {!data && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <CubeLoader
              className="w-36 h-36 opacity-90"
              ariaLabel="Animación de cubo"
            />
            <p className="text-sm text-muted-foreground">
              Carga un STL para previsualizarlo aquí
            </p>
          </div>
        </div>
      )}

      {/* FAB expandir/contraer */}
      {canExpand && (
        <Button
          onClick={onToggleExpandAndGenerate}
          disabled={isConverting}
          title={title}
          variant="default"
          className={cn(
            "absolute top-4 right-4 z-10",
            "h-10 w-10 p-0",
            isConverting && "animate-pulse",
            "cursor-pointer disabled:cursor-not-allowed",
          )}
        >
          {isConverting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isExpanded ? (
            <ChevronLeft className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </Button>
      )}

      {data && rotateModel && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Rotate3D className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Transformaciones</span>
              {isModelModified && (
                <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] font-medium text-yellow-200">
                  Modelo modificado
                </span>
              )}
            </div>
            {onResetTransform && (
              <Button
                onClick={onResetTransform}
                disabled={transformsDisabled}
                variant="outline"
                className="h-8 px-2 text-xs"
                title="Restablecer orientación y escala"
              >
                <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>

          <div className="grid grid-cols-6 gap-2">
            
            {/* 1. Rotar en Y (Izquierda/Derecha) -> PRIMEROS */}
            <Button
              onClick={() => rotateModel("y", -90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Y -90° (Izquierda)"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("y", 90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Y +90° (Derecha)"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>

            {/* 2. Rotar en Z (Horario/Anti-horario) -> EN MEDIO */}
            <Button
              onClick={() => rotateModel("z", -90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Z -90° (Anti-horario)"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("z", 90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Z +90° (Horario)"
            >
              <RotateCw className="w-4 h-4" />
            </Button>

            {/* 3. Rotar en X (Arriba/Abajo) -> ÚLTIMOS */}
            <Button
              onClick={() => rotateModel("x", -90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar X -90° (Abajo)"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("x", 90)}
              disabled={transformsDisabled}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar X +90° (Arriba)"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>

          </div>

          {onScaleChange && (
            <div className="grid gap-2 sm:grid-cols-[1fr_5rem] sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Escala uniforme</span>
                  <span className="font-mono text-foreground">{modelScale.toFixed(2)}x</span>
                </div>
                <input
                  disabled={transformsDisabled}
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.05"
                  value={modelScale}
                  onChange={(event) => onScaleChange(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <input
                disabled={transformsDisabled}
                type="number"
                min="0.1"
                max="5"
                step="0.05"
                value={modelScale}
                onChange={(event) => onScaleChange(Number(event.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground"
                aria-label="Escala uniforme del modelo"
              />
            </div>
          )}

          <div className="grid gap-2 rounded-md border border-border/50 bg-background/35 p-2 text-xs text-muted-foreground sm:grid-cols-3">
            <span>X: <b className="font-mono text-foreground">{dimensions ? dimensions.x.toFixed(2) : "--"} mm</b></span>
            <span>Y: <b className="font-mono text-foreground">{dimensions ? dimensions.y.toFixed(2) : "--"} mm</b></span>
            <span>Z: <b className="font-mono text-foreground">{dimensions ? dimensions.z.toFixed(2) : "--"} mm</b></span>
          </div>

          {isModelModified && isAnalyzed && (
            <p className="text-xs text-yellow-200">
              El modelo fue modificado en la vista. Usa Analizar/Reanalizar antes de generar G-code definitivo.
            </p>
          )}

          {isModelLocked && (
            <p className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-2 text-xs text-yellow-100">
              El modelo está bloqueado porque ya se generó el G-code. Para modificarlo, quite el resultado actual o vuelva a cargar el STL.
            </p>
          )}
        </div>
      )}
      {/* ===== FIN: Panel de Rotación ===== */}
    </div>
  )
}

const Preview3D = React.memo(Preview3DBase)
Preview3D.displayName = "Preview3D"

export default Preview3D
