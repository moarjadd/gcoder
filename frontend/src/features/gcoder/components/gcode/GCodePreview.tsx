"use client"

import { Button } from "@/components/ui/button"
import type { ConvertResponse } from "@/features/gcoder/types"
import * as React from "react"

type Report = ConvertResponse["report"]

function formatDimensions(dimensions?: { x: number; y: number; z: number } | null) {
  if (!dimensions) return "N/D"
  return `X${dimensions.x.toFixed(3)} Y${dimensions.y.toFixed(3)} Z${dimensions.z.toFixed(3)} mm`
}

function formatDuration(ms?: number | null, fallback?: string) {
  if (typeof ms === "number" && Number.isFinite(ms)) {
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`
    const minutes = Math.floor(ms / 60_000)
    const seconds = (ms - minutes * 60_000) / 1000
    return `${minutes} min ${seconds.toFixed(2).padStart(5, "0")} s`
  }
  return fallback ?? "N/D"
}

function formatMm(value?: number | null, digits = 4) {
  return value == null ? "N/D" : `${value.toFixed(digits)} mm`
}

function formatPercent(value?: number | null, digits = 3) {
  return value == null ? "N/D" : `${value.toFixed(digits)} %`
}

function normalizeWarningKey(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes("model_small_relative_to_tool")) return "MODEL_SMALL_RELATIVE_TO_TOOL"
  if (lower.includes("tool_large_relative_to_model")) return "TOOL_LARGE_RELATIVE_TO_MODEL"
  if (lower.includes("fine_details_may_be_lost") || lower.includes("detail_loss_risk")) return "FINE_DETAILS_MAY_BE_LOST"
  if (lower.includes("hole_too_small_for_tool")) return "HOLE_TOO_SMALL_FOR_TOOL"
  if (lower.includes("hole_preservation_incomplete")) return "HOLE_PRESERVATION_INCOMPLETE"
  if (lower.includes("convex hull fallback")) return "CONVEX_HULL_FALLBACK"
  if (lower.includes("lost_holes_detected")) return "LOST_HOLES_DETECTED"
  if (lower.includes("geometry_repair_used")) return "GEOMETRY_REPAIR_USED"
  return lower.replace(/z=\d+(\.\d+)?\s*mm/g, "z=*").replace(/\s+/g, " ").trim()
}

function warningCategory(message: string) {
  const key = normalizeWarningKey(message)
  if (key.includes("HOLE") || key.includes("HUECO")) return "Huecos internos"
  if (key.includes("TOOL") || key.includes("FINE_DETAILS")) return "Herramienta y detalle"
  if (key.includes("CONVEX") || key.includes("GEOMETRY") || key.includes("LOST")) return "Geometría"
  return "Advertencia"
}

function uniqueMessages(messages: string[]) {
  const unique = new Map<string, string>()
  for (const message of messages) {
    const clean = message.trim()
    if (!clean) continue
    const key = normalizeWarningKey(clean)
    if (!unique.has(key)) unique.set(key, clean)
  }
  return Array.from(unique.values())
}

function warningItems(report?: Report | null) {
  if (!report) return []
  return uniqueMessages([...report.warnings, ...report.layer_geometry_warnings, ...report.anomalies]).map((message) => ({
    category: warningCategory(message),
    message,
  }))
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

export default function GCodePreview({
  lines,
  estimatedTime,
  code,
  report,
  onDownload,
}: {
  lines: number
  estimatedTime: string
  code: string
  report?: Report | null
  onDownload: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  const codeLines = React.useMemo(
    () => code.replace(/\r\n/g, "\n").split("\n"),
    [code],
  )
  const warnings = React.useMemo(() => warningItems(report), [report])
  const warningCount = React.useMemo(
    () => uniqueMessages([...(report?.warnings ?? []), ...(report?.layer_geometry_warnings ?? [])]).length,
    [report],
  )
  const anomalyCount = React.useMemo(() => uniqueMessages(report?.anomalies ?? []).length, [report])
  const codeStyle = {
    "--digits": String(String(codeLines.length).length),
    "--gutter": `calc(var(--digits) * 1ch + 1.0rem)`,
  } as React.CSSProperties & Record<"--digits" | "--gutter", string>

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div>
            <h3 className="text-lg font-semibold text-foreground">G-code generado correctamente</h3>
            <p className="text-sm text-muted-foreground">Archivo .nc listo para simulación previa.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
              Estado: {report?.conversionSuccess === false ? "Revisar" : "Generado"}
            </span>
            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-yellow-100">
              Advertencias: {warningCount}
            </span>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-100">
              Anomalías: {anomalyCount}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={copyCode} className="cursor-pointer" aria-live="polite">
            {copied ? "Copiado" : "Copiar G-code"}
          </Button>
          <Button onClick={onDownload} disabled={!code} className="cursor-pointer">
            Descargar .nc
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Resumen de conversión</h4>
        <div className="grid gap-2 sm:grid-cols-4">
          <MetricCard label="Capas" value={report?.layersCount ?? "N/D"} />
          <MetricCard label="Movimientos" value={report?.toolpathMovesCount ?? "N/D"} />
          <MetricCard label="Líneas generadas" value={lines} />
          <MetricCard
            label="Tiempo total"
            value={formatDuration(report?.conversion_total_ms, estimatedTime)}
          />
        </div>
      </section>

      {report && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Rendimiento por etapa</h4>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-5">
            <MetricCard label="Análisis" value={formatDuration(report.analysis_ms)} />
            <MetricCard label="Slicing" value={formatDuration(report.slicing_ms)} />
            <MetricCard label="Toolpath" value={formatDuration(report.toolpath_ms)} />
            <MetricCard label="G-code" value={formatDuration(report.postprocess_ms)} />
            <MetricCard label="Total" value={formatDuration(report.conversion_total_ms)} />
          </div>
        </section>
      )}

      {report && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Precisión geométrica</h4>
          <div className="grid gap-2 sm:grid-cols-5">
            <MetricCard label="RMSE" value={formatMm(report.rmse_mm)} />
            <MetricCard label="Error máximo" value={formatMm(report.max_error_mm)} />
            <MetricCard label="Error medio" value={formatMm(report.mean_error_mm)} />
            <MetricCard label="Error de área" value={formatPercent(report.area_error_percent)} />
            <MetricCard
              label="Huecos preservados"
              value={report.hole_preservation_rate == null ? "N/D" : `${(report.hole_preservation_rate * 100).toFixed(1)} %`}
            />
          </div>
        </section>
      )}

      {report && (
        <section className="space-y-3 rounded-md border border-border/50 bg-muted/25 p-3 text-xs text-muted-foreground">
          <h4 className="text-sm font-semibold text-foreground">Preparación recomendada del stock</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <span>Dimensiones del modelo STL: <b className="text-foreground">{formatDimensions(report.model_dimensions_mm)}</b></span>
            <span>Stock usado por el algoritmo: <b className="text-foreground">{formatDimensions(report.algorithm_stock_mm)}</b></span>
            <span>Stock físico recomendado: <b className="text-foreground">{formatDimensions(report.recommended_physical_stock_mm)}</b></span>
            <span>Margen lateral recomendado: <b className="text-foreground">{report.recommended_margin_xy_mm.toFixed(3)} mm</b></span>
            <span>Altura extra recomendada: <b className="text-foreground">{report.recommended_extra_z_mm.toFixed(3)} mm</b></span>
            <span>Herramienta: <b className="text-foreground">End mill {report.tool_diameter_mm.toFixed(3)} mm</b></span>
          </div>
          <div className="space-y-1">
            <p>Origen asumido: <b className="text-foreground">{report.work_origin_assumption}</b></p>
            <p>Z cero: <b className="text-foreground">{report.z_zero_assumption}</b></p>
            <p className="rounded-md border border-primary/20 bg-primary/10 p-2 text-primary-foreground/90">
              El stock físico puede ser mayor que el stock algorítmico. Configure X0/Y0 en la esquina inferior izquierda del área efectiva de mecanizado.
            </p>
          </div>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="max-h-36 overflow-auto rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-100">
          <h4 className="mb-2 text-sm font-semibold text-yellow-50">Advertencias</h4>
          <div className="space-y-2">
            {warnings.map((item) => (
              <div key={`${item.category}-${item.message}`} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                <span className="font-medium text-yellow-50">{item.category}</span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs font-medium text-yellow-100">
        Simule el archivo y realice una prueba en aire antes del mecanizado real.
      </p>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background/50">
        <pre className="gc-code relative m-0 p-4 font-mono text-xs leading-5" style={codeStyle}>
          {codeLines.map((line, index) => (
            <span key={index} className="gc-line">
              {line === "" ? " " : line}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>

      <style jsx>{`
        .gc-code {
          counter-reset: ln;
          --gutter-color: var(--chart-3);
        }

        .gc-code::after {
          content: none;
        }

        .gc-line {
          display: block;
          position: relative;
          padding-left: calc(var(--gutter) + 1rem);
          white-space: pre;
        }

        .gc-line::before {
          counter-increment: ln;
          content: counter(ln);
          position: absolute;
          left: 0;
          width: calc(var(--gutter) + 0.5rem);
          padding-right: 0.5rem;
          text-align: right;
          color: var(--gutter-color);
          user-select: none;
          -webkit-user-select: none;
          opacity: 0.95;
          font-variant-numeric: tabular-nums;
          line-height: 1.25rem;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}
