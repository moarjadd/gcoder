"use client"

import { AlertCircle, CheckCircle, Info, Search, XCircle, Zap, Bug, TriangleAlert } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import type { ConvexityAnalysis } from "@/features/gcoder/lib/convexity"

type Props = {
  isAnalyzing: boolean
  analysis: ConvexityAnalysis | null
  isDebugMode: boolean
}

// Función auxiliar para extraer datos de texto si el objeto falla (Respaldo)
function getMetricFromDetails(detailsStr: string | undefined, regex: RegExp): number {
  if (!detailsStr) return 0
  const m = detailsStr.match(regex)
  return m?.[1] ? parseFloat(m[1]) : 0
}

function MetricBar({
  label,
  value, // Valor esperado entre 0 y 100
  variant = "info",
  threshold, // Umbral opcional para mostrar la línea de límite
}: {
  label: string
  value: number
  variant?: "info" | "success" | "warning" | "danger"
  threshold?: number
}) {
  const percent = Math.max(0, Math.min(100, value))
  
  const colors = {
    info: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    danger: "bg-red-500",
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("font-mono", variant === "danger" ? "text-red-400" : "text-muted-foreground")}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted/50 overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500 rounded-full", colors[variant])} 
          style={{ width: `${percent}%` }} 
        />
        {/* Línea de umbral opcional visual */}
        {threshold !== undefined && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/30 z-10" 
            style={{ left: `${threshold}%` }} 
            title={`Límite: ${threshold}%`}
          />
        )}
      </div>
    </div>
  )
}

export default function AnalysisBlock({ isAnalyzing, analysis, isDebugMode }: Props) {
  // 1. Estado de Carga
  if (isAnalyzing) {
    return (
      <div className="space-y-3 border-t border-border pt-4 animate-pulse">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500 animate-spin-slow" />
          <h4 className="text-lg font-semibold text-foreground">Calculando geometría...</h4>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="w-4 h-4" />
          <p>Verificando viabilidad para 3 ejes (buscando undercuts)...</p>
        </div>
      </div>
    )
  }

  // 2. Sin Análisis
  if (!analysis) return null

  // 3. Extracción de Datos (Priorizando el objeto estructurado)
  const { isConvex, convexityRatio, machinability, details } = analysis
  const m = machinability || {}

  // Ratios convertidos a porcentajes (0.0 - 1.0 -> 0 - 100)
  // Usamos el objeto primero, si no existe, intentamos parsear el string de detalles
  const cvxPercent = (convexityRatio ?? 0) * 100
  
  const undercutRatioVal = m.undercutRatio ?? getMetricFromDetails(details, /undercuts=([\d.]+)%/) / 100
  const undercutPercent = undercutRatioVal * 100

  const baseOkRatioVal = m.baseFlatRatio ?? (getMetricFromDetails(details, /baseOk=([\d.]+)%/) / 100)
  const baseOkPercent = baseOkRatioVal * 100 // Ojo: baseFlatRatio suele venir ya como 0-1 en el objeto

  // Determinación de Estado
  const isMachinable = m.isThreeAxisMachable ?? false

  // Lógica de Mensajes de Error (Jerarquía de importancia)
  let failureReason = ""
  if (!isMachinable) {
    if (undercutPercent > 1) {
      failureReason = "CRÍTICO: Se detectaron zonas inalcanzables (undercuts). La herramienta no puede llegar a estas áreas sin chocar."
    } else if (baseOkPercent < 90) {
      failureReason = "Inestable: La base del modelo no es suficientemente plana para adherirse a la cama del CNC."
    } else if ((m.topFaceDownRatio ?? 0) > 0.01) {
      failureReason = "Orientación incorrecta: Demasiadas caras funcionales están mirando hacia abajo."
    } else {
      failureReason = "Geometría compleja no compatible con 3 ejes estándar."
    }
  }

  const mainMessage = isMachinable
    ? "Modelo compatible para mecanizado CNC de 3 ejes."
    : failureReason

  return (
    <div className="space-y-4 border-t border-border pt-4 transition-all duration-300">
      
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          <h4 className="text-lg font-semibold text-foreground">Reporte de Viabilidad</h4>
        </div>
        {/* Badges de Estado */}
        <div className="flex gap-2">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1",
              isConvex 
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                : "bg-purple-500/10 text-purple-400 border-purple-500/20"
            )}>
               {isConvex ? "Convexo" : "Cóncavo"}
            </span>
        </div>
      </div>

      {/* Tarjeta Principal de Resultado */}
      <div className={cn(
        "p-4 rounded-xl border flex items-start gap-3",
        isMachinable 
          ? "bg-green-500/5 border-green-500/20" 
          : "bg-red-500/5 border-red-500/20"
      )}>
        {isMachinable ? (
          <CheckCircle className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
        )}
        <div>
          <h5 className={cn("font-semibold", isMachinable ? "text-green-400" : "text-red-400")}>
            {isMachinable ? "Fabricable" : "No Fabricable"}
          </h5>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {mainMessage}
          </p>
        </div>
      </div>

      {/* Métricas Detalladas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Columna 1: Críticos para CNC */}
        <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <h6 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Métricas de Fabricación</h6>
            
            <MetricBar
                label="Zonas Inalcanzables (Undercuts)"
                value={undercutPercent}
                // Si tiene más de 1% de undercuts, es peligro (rojo), si no, es excelente (verde)
                variant={undercutPercent > 1 ? "danger" : "success"}
                threshold={1} // Marca visual del 1%
            />
            
            <MetricBar
                label="Estabilidad de Base"
                value={baseOkPercent}
                // Si la base es menos del 90% plana, es warning/danger
                variant={baseOkPercent < 90 ? "warning" : "success"}
                threshold={90}
            />
        </div>

        {/* Columna 2: Geometría Matemática */}
        <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <h6 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Análisis Geométrico</h6>
            
            <MetricBar
                label="Índice de Convexidad"
                value={cvxPercent}
                variant="info"
            />
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
               <Info className="w-3 h-3" />
               <span>Volumen Malla: {(analysis.meshVolume / 1000).toFixed(2)} cm³</span>
            </div>
        </div>
      </div>

      {/* Panel Debug (Ocultable) */}
      {isDebugMode && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Bug className="w-3 h-3" />
            Ver datos crudos JSON
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/80 p-3 text-[10px] text-green-400 font-mono border border-green-900/50">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}