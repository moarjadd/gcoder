"use client"

import { AlertCircle, CheckCircle, Info, Search, XCircle, Zap, Bug, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ConvexityAnalysis } from "@/features/gcoder/legacy/convexity"
import type { AnalyzeResponse } from "@/features/gcoder/api/gcoderClient"

type Props = {
  isAnalyzing: boolean
  analysis: ConvexityAnalysis | null
  backendAnalysis: AnalyzeResponse | null
  backendAnalysisError: string | null
  isDebugMode: boolean
}

// Función auxiliar para extraer datos de texto si el objeto falla (Respaldo)
function getMetricFromDetails(detailsStr: string | undefined, regex: RegExp): number {
  if (!detailsStr) return 0
  const m = detailsStr.match(regex)
  return m?.[1] ? parseFloat(m[1]) : 0
}

const DIAGNOSTIC_LABELS: Record<string, string> = {
  convexity_ratio_below_threshold: "Convexidad bajo umbral",
  concavity_detected_accessible: "Concavidad accesible desde Z",
  not_watertight: "Malla no cerrada",
  winding_inconsistent: "Normales inconsistentes",
  underside_area_ratio_above_threshold: "Superficies descendentes fuera de base",
  complex_column_ratio_above_threshold: "Columnas verticales complejas",
  base_flatness_below_threshold: "Base plana insuficiente",
  potential_undercuts_detected: "Posibles socavados",
  three_axis_machinability_failed: "No cumple heurística 3 ejes",
  warnings_present: "Advertencias activas",
}

function formatDiagnosticCode(code: string): string {
  return DIAGNOSTIC_LABELS[code] ?? code.replace(/_/g, " ")
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

export default function MeshAnalysisCard({ isAnalyzing, analysis, backendAnalysis, backendAnalysisError, isDebugMode }: Props) {
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
  if (!analysis && !backendAnalysis && !backendAnalysisError) return null

  // 3. Extracción de Datos (Priorizando el objeto estructurado)
  const { isConvex = false, convexityRatio = 0, machinability, details } = analysis ?? {}
  const m = (machinability || {}) as Partial<ConvexityAnalysis["machinability"]>
  const backendMachinability = backendAnalysis?.machinability
  const backendDetails = backendMachinability?.details as Record<string, number> | undefined

  // Ratios convertidos a porcentajes (0.0 - 1.0 -> 0 - 100)
  // Usamos el objeto primero, si no existe, intentamos parsear el string de detalles
  const cvxPercent = ((backendDetails?.convexityRatio ?? convexityRatio ?? 0) as number) * 100
  
  const undercutRatioVal =
    backendDetails?.undersideAreaRatio ?? m.undercutRatio ?? getMetricFromDetails(details, /undercuts=([\d.]+)%/) / 100
  const undercutPercent = undercutRatioVal * 100

  const baseOkRatioVal = backendMachinability?.baseFlatnessScore ?? m.baseFlatRatio ?? (getMetricFromDetails(details, /baseOk=([\d.]+)%/) / 100)
  const baseOkPercent = baseOkRatioVal * 100 // Ojo: baseFlatRatio suele venir ya como 0-1 en el objeto

  // Determinación de Estado
  const isMachinable = backendMachinability?.isThreeAxisMachinable ?? m.isThreeAxisMachable ?? false

  // Lógica de Mensajes de Error (Jerarquía de importancia)
  let failureReason = ""
  if (backendAnalysisError && !backendAnalysis) {
    failureReason = backendAnalysisError
  } else if (!isMachinable) {
    if (undercutPercent > 1) {
      failureReason = "CRÍTICO: Se detectaron zonas inalcanzables (undercuts). La herramienta no puede llegar a estas áreas sin chocar."
    } else if (baseOkPercent < 90) {
      failureReason = "Inestable: La base del modelo no es suficientemente plana para adherirse a la cama del CNC."
    } else if ((m.topFaceDownRatio ?? 0) > 0.01) {
      failureReason = "Orientación incorrecta: Demasiadas caras funcionales están mirando hacia abajo."
    } else {
      failureReason = backendMachinability?.explanation ?? "Geometría compleja no compatible con 3 ejes estándar."
    }
  }

  const mainMessage = isMachinable
    ? (backendMachinability?.explanation ?? "Modelo compatible para mecanizado CNC de 3 ejes.")
    : failureReason
  const statusLabels: Record<string, string> = {
    APTO_PARA_CONVERSION: "Modelo apto para conversión",
    APTO_CON_ADVERTENCIAS: "Modelo apto con advertencias",
    NO_APTO_MALLA_INVALIDA: "Modelo no apto por malla inválida",
    NO_APTO_POR_GEOMETRIA: "Modelo no apto por geometría",
  }
  const thesisStatus = backendAnalysis?.thesisFriendlyStatus
  const statusLabel = thesisStatus ? statusLabels[thesisStatus] ?? thesisStatus : null
  const classificationReasons = backendAnalysis?.classification_reasons ?? []
  const warningDetails = backendAnalysis?.warning_details ?? {}
  const convexityDetail =
    typeof warningDetails.convexity_ratio === "number" && typeof warningDetails.convexity_threshold === "number"
      ? `${(warningDetails.convexity_ratio * 100).toFixed(1)}% / ${(warningDetails.convexity_threshold * 100).toFixed(1)}%`
      : null

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
               {(backendMachinability?.isLikelyConvex ?? isConvex) ? "Convexo" : "Cóncavo accesible"}
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
            {statusLabel ?? (isMachinable ? "Modelo apto para conversión" : "Modelo no apto por geometría")}
          </h5>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {mainMessage}
          </p>
          {classificationReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {classificationReasons.map((reason) => (
                <span key={reason} className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-200">
                  {formatDiagnosticCode(reason)}
                </span>
              ))}
            </div>
          )}
          {convexityDetail && (
            <p className="mt-2 text-xs text-muted-foreground">
              Convexidad medida / umbral: <span className="font-mono text-foreground">{convexityDetail}</span>
            </p>
          )}
          {isMachinable && (
            <p className="mt-2 text-xs text-muted-foreground">
              Se recomienda validar el G-code antes de ejecutarlo en una máquina real.
            </p>
          )}
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
               <span>Volumen Malla: {(((backendAnalysis?.volumeApprox ?? analysis?.meshVolume ?? 0) as number) / 1000).toFixed(2)} cm³</span>
            </div>
        </div>
      </div>

      {/* Análisis backend */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
        <div className="flex items-center justify-between gap-3">
          <h6 className="text-xs font-semibold uppercase text-muted-foreground">Análisis backend</h6>
          {backendAnalysis && (
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium border",
                backendAnalysis.validation.isValid
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20",
              )}
            >
              {backendAnalysis.validation.isValid ? "Válida" : "Revisar"}
            </span>
          )}
        </div>

        {backendAnalysisError && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{backendAnalysisError}</span>
          </div>
        )}

        {backendAnalysis && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Triángulos</div>
                <div className="font-mono text-foreground">{backendAnalysis.triangleCount.toLocaleString()}</div>
              </div>
              <div className="rounded-md bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Vértices</div>
                <div className="font-mono text-foreground">{backendAnalysis.vertexCount.toLocaleString()}</div>
              </div>
              <div className="rounded-md bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Malla cerrada</div>
                <div className="font-medium text-foreground">
                  {backendAnalysis.validation.isWatertight ? "Sí" : "No"}
                </div>
              </div>
              <div className="rounded-md bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Tiempo análisis</div>
                <div className="font-mono text-foreground">
                  {backendAnalysis.analysis_total_human ?? `${(backendAnalysis.processingTimeSeconds ?? 0).toFixed(2)}s`}
                </div>
              </div>
            </div>

            <div className="rounded-md bg-background/40 p-3">
              <div className="text-xs text-muted-foreground mb-2">Dimensiones</div>
              <div className="grid gap-2 sm:grid-cols-3 font-mono text-xs text-foreground">
                <span>X: {(backendAnalysis.bounds.size[0] ?? 0).toFixed(2)} mm</span>
                <span>Y: {(backendAnalysis.bounds.size[1] ?? 0).toFixed(2)} mm</span>
                <span>Z: {(backendAnalysis.bounds.size[2] ?? 0).toFixed(2)} mm</span>
              </div>
            </div>

            <div className="rounded-md bg-background/40 p-3">
              <div className="text-xs text-muted-foreground mb-2">Transformación aplicada</div>
              <div className="grid gap-2 font-mono text-xs text-foreground sm:grid-cols-4">
                <span>X: {backendAnalysis.transformApplied.rotation_x_deg.toFixed(0)}°</span>
                <span>Y: {backendAnalysis.transformApplied.rotation_y_deg.toFixed(0)}°</span>
                <span>Z: {backendAnalysis.transformApplied.rotation_z_deg.toFixed(0)}°</span>
                <span>Escala: {backendAnalysis.transformApplied.scale.toFixed(2)}x</span>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2">
                {backendAnalysis.validation.isWindingConsistent ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <TriangleAlert className="w-4 h-4 text-yellow-500" />
                )}
                Normales consistentes: {backendAnalysis.validation.isWindingConsistent ? "sí" : "no"}
              </div>
              <div className="flex items-center gap-2">
                {backendAnalysis.validation.isWatertight ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <TriangleAlert className="w-4 h-4 text-yellow-500" />
                )}
                Malla cerrada: {backendAnalysis.validation.isWatertight ? "sí" : "no"}
              </div>
            </div>

            {(backendAnalysis.validation.warnings.length > 0 || backendAnalysis.validation.errors.length > 0) && (
              <div className="space-y-2">
                {backendAnalysis.validation.warnings.map((warning) => (
                  <div key={warning} className="flex items-start gap-2 text-xs text-yellow-300">
                    <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
                {backendAnalysis.validation.errors.map((error) => (
                  <div key={error} className="flex items-start gap-2 text-xs text-red-300">
                    <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel Debug (Ocultable) */}
      {isDebugMode && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Bug className="w-3 h-3" />
            Ver datos crudos JSON
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/80 p-3 text-[10px] text-green-400 font-mono border border-green-900/50">
            {JSON.stringify({ frontend: analysis, backend: backendAnalysis }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
