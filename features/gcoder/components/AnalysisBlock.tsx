"use client"

import { AlertCircle, CheckCircle, Info, Search, XCircle, Zap, Bug } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import type { ConvexityAnalysis } from "@/features/gcoder/lib/convexity"

type Props = {
  isAnalyzing: boolean
  analysis: (ConvexityAnalysis | { details: string; [key: string]: any }) | null
  isDebugMode: boolean
}

const METRIC_REGEX: Record<"ratio" | "undercuts" | "baseOk" | "topDown", RegExp> = {
  ratio: /ratio=([\d.]+)/,
  undercuts: /undercuts=([\d.]+)%/,
  baseOk: /baseOk=([\d.]+)%/,
  topDown: /topDown=([\d.]+)%/,
}

function getMetricFromDetails(
  detailsStr: string,
  metric: "ratio" | "undercuts" | "baseOk" | "topDown",
): number {
  if (!detailsStr) return -1
  const re = METRIC_REGEX[metric]
  const m = detailsStr.match(re)
  return m?.[1] ? parseFloat(m[1]) : -1
}

function MetricBar({
  label,
  value,
  variant = "info",
}: {
  label: string
  value: number
  variant?: "info" | "success" | "warning" | "danger"
}) {
  const percent = Math.max(0, Math.min(100, value))
  const color = {
    info: "#3b82f6",
    success: "#22c55e",
    warning: "#eab308",
    danger: "#ef4444",
  }[variant]

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-muted overflow-hidden">
        <div className="h-2" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function AnalysisBlock({ isAnalyzing, analysis, isDebugMode }: Props) {
  if (isAnalyzing) {
    return (
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h4 className="text-lg font-semibold text-foreground">Analizando...</h4>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Info className="w-5 h-5 text-primary" />
          <p>Por favor, espera mientras analizamos tu modelo.</p>
        </div>
      </div>
    )
  }

  if (!analysis) return null

  const debugString =
    (analysis as any).machinability?.details || (analysis as any).error || (analysis as any).details || ""

  const isConvex = (analysis as any).isConvex

  const convexityPercent =
    typeof (analysis as any).convexityRatio === "number"
      ? (analysis as any).convexityRatio * 100
      : Math.max(0, getMetricFromDetails(debugString, "ratio")) * 100

  const undercutPercent =
    (analysis as any).machinability?.undercutRatio != null
      ? (analysis as any).machinability.undercutRatio * 100
      : Math.max(0, getMetricFromDetails(debugString, "undercuts"))

  const topFaceDownRatio =
    (analysis as any).machinability?.topFaceDownRatio != null
      ? (analysis as any).machinability.topFaceDownRatio
      : Math.max(0, getMetricFromDetails(debugString, "topDown")) / 100

  const baseOkPercent =
    (analysis as any).machinability?.details
      ? getMetricFromDetails((analysis as any).machinability.details, "baseOk")
      : Math.max(0, getMetricFromDetails(debugString, "baseOk"))

  const isMachinable =
    (analysis as any).machinability?.isThreeAxisMachable ??
    (undercutPercent < 1 && baseOkPercent >= 90 && topFaceDownRatio < 0.02)

  let failureReason = ""
  if (!isMachinable) {
    if (undercutPercent > 1) {
      failureReason =
        "El modelo tiene socavados (undercuts). Hay superficies que la fresa no puede alcanzar desde arriba."
    } else if (baseOkPercent < 90) {
      failureReason = "El modelo no tiene una base plana. No se puede sujetar firmemente a la cama."
    } else if (topFaceDownRatio > 0.01) {
      failureReason = "Hay caras mirando hacia abajo o casi verticales que impiden el mecanizado."
    } else if (debugString.includes("Geometría 2D")) {
      failureReason = "El modelo es 2D y no tiene volumen para mecanizar."
    } else {
      failureReason = "El modelo no es fabricable. Revisa el log de debug para más detalles."
    }
  }

  const mainMessage = isMachinable
    ? "¡Éxito! El modelo es compatible. Continúa para generar el G-code."
    : isConvex
    ? `El modelo es Convexo, pero No es Fabricable. ${failureReason}`
    : `El modelo es Cóncavo y No Fabricable. ${failureReason}`

  return (
    <div className={cn("space-y-3 border-t border-border pt-4 transition-all duration-300")}>
      {/* Título */}
      <div className="flex items-center gap-2">
        <Search className="w-5 h-5 text-primary" />
        <h4 className="text-lg font-semibold text-foreground">Análisis de Fabricabilidad</h4>
      </div>

      {/* Panel Debug (solo si está activo) */}
      {isDebugMode && (
        <details className="p-3 rounded-lg bg-muted/50 border border-border" open>
          <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2">
            <Bug className="w-4 h-4 text-yellow-500" />
            Panel de Depuración (Datos crudos)
          </summary>
          <pre className="mt-2 p-2 rounded-md bg-black/50 text-xs text-white overflow-auto whitespace-pre-wrap">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </details>
      )}

      {/* Estado y etiquetas */}
      <div className="flex flex-wrap items-center gap-2">
        {isMachinable ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
        <span className="text-sm text-foreground">Análisis completado</span>

        <span
          className={cn(
            "ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
            isConvex
              ? "text-green-600 bg-green-500/10 border-green-500/30"
              : "text-yellow-600 bg-yellow-500/10 border-yellow-500/30",
          )}
        >
          {isConvex ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {isConvex ? "Convexo" : "Cóncavo"}
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
            isMachinable
              ? "text-green-600 bg-green-500/10 border-green-500/30"
              : "text-red-600 bg-red-500/10 border-red-500/30",
          )}
        >
          {isMachinable ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {isMachinable ? "Fabricable" : "No Fabricable"}
        </span>
      </div>

      {/* Mensaje */}
      <div
        className={cn(
          "p-3 rounded-lg border text-sm",
          isMachinable
            ? "bg-green-500/10 border-green-500/30 text-green-300"
            : "bg-red-500/10 border-red-500/30 text-red-300",
        )}
      >
        {mainMessage}
      </div>

      {/* Métricas compactas */}
      <div className="space-y-2">
        <MetricBar
          label="Ratio de Convexidad"
          value={convexityPercent}
          variant={isConvex ? "success" : "warning"}
        />
        <MetricBar
          label="Socavados (Undercuts)"
          value={undercutPercent}
          variant={undercutPercent > 1 ? "danger" : "success"}
        />
        <MetricBar
          label="Planitud de Base"
          value={baseOkPercent}
          variant={baseOkPercent < 90 ? "danger" : "success"}
        />
      </div>
    </div>
  )
}
