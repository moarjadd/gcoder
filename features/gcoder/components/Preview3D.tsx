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
} from "lucide-react"
import { cn } from "@/shared/lib/utils"
import CubeLoader from "@/features/gcoder/components/CubeLoader"

type Props = {
  data?: ArrayBuffer
  canExpand: boolean
  isConverting: boolean
  isExpanded: boolean
  onToggleExpandAndGenerate: () => void
  className?: string
  modelRotation?: { x: number; y: number; z: number }
  rotateModel?: (axis: "x" | "y" | "z", degrees: number) => void
  isAnalyzed?: boolean
}

// Lazy load del visor
const StlViewer = dynamic(() => import("@/features/gcoder/components/StlViewer"), {
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
  isAnalyzed,
}: Props) {
  const viewerProps = React.useMemo(
    () => ({
      data,
      color: "#22c55e",
      wireframe: false,
      zUp: true,
      autoRotate: false,
      modelRotation,
    }),
    [data, modelRotation],
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
              Carga un STL para previsualizarlo aqui
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

      {/* ===== INICIO: Panel de Rotación de Modelo ===== */}
      {data && rotateModel && (
        <div className="p-3 border-t border-border bg-muted/20">
          <div className="grid grid-cols-6 gap-2">
            
            {/* 1. Rotar en Y (Izquierda/Derecha) -> PRIMEROS */}
            <Button
              onClick={() => rotateModel("y", -90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Y -90° (Izquierda)"
              disabled={isAnalyzed}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("y", 90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Y +90° (Derecha)"
              disabled={isAnalyzed}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>

            {/* 2. Rotar en Z (Horario/Anti-horario) -> EN MEDIO */}
            <Button
              onClick={() => rotateModel("z", -90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Z -90° (Anti-horario)"
              disabled={isAnalyzed}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("z", 90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar Z +90° (Horario)"
              disabled={isAnalyzed}
            >
              <RotateCw className="w-4 h-4" />
            </Button>

            {/* 3. Rotar en X (Arriba/Abajo) -> ÚLTIMOS */}
            <Button
              onClick={() => rotateModel("x", -90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar X -90° (Abajo)"
              disabled={isAnalyzed}
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => rotateModel("x", 90)}
              variant="outline"
              className="h-9 w-full px-0 cursor-pointer disabled:cursor-not-allowed"
              title="Rotar X +90° (Arriba)"
              disabled={isAnalyzed}
            >
              <ArrowUp className="w-4 h-4" />
            </Button>

          </div>
        </div>
      )}
      {/* ===== FIN: Panel de Rotación ===== */}
    </div>
  )
}

const Preview3D = React.memo(Preview3DBase)
Preview3D.displayName = "Preview3D"

export default Preview3D