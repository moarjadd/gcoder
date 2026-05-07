"use client"
import { Button } from "@/components/ui/button"
import * as React from "react"

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
  report?: {
    conversionSuccess: boolean
    processingTimeSeconds: number
    layersCount: number
    toolpathMovesCount: number
    warnings: string[]
    anomalies: string[]
    metrics: Record<string, unknown>
  } | null
  onDownload: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  const codeLines = React.useMemo(
    () => code.replace(/\r\n/g, "\n").split("\n"),
    [code]
  )
  const codeStyle = {
    "--digits": String(String(codeLines.length).length),
    "--gutter": `calc(var(--digits) * 1ch + 1.0rem)`,
  } as React.CSSProperties & Record<"--digits" | "--gutter", string>

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code) // copia SOLO el G-code puro
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between flex-shrink-0 gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{lines}</span> líneas generadas
          </p>
          <p className="text-sm text-muted-foreground">
            Tiempo estimado: <span className="font-semibold text-foreground">{estimatedTime}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={copyCode}
            className="cursor-pointer"
            aria-live="polite"
          >
            {copied ? "¡Copiado!" : "Copiar"}
          </Button>
          <Button onClick={onDownload} disabled={!code} className="cursor-pointer">
            Descargar .nc
          </Button>
        </div>
      </div>

      {report && (
        <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          <span>Estado: <b className="text-foreground">{report.conversionSuccess ? "Generado" : "Revisar"}</b></span>
          <span>Capas: <b className="text-foreground">{report.layersCount}</b></span>
          <span>Movimientos: <b className="text-foreground">{report.toolpathMovesCount}</b></span>
          <span>Líneas: <b className="text-foreground">{lines}</b></span>
          <span>Tiempo: <b className="text-foreground">{report.processingTimeSeconds.toFixed(2)}s</b></span>
          <span>Warnings: <b className="text-foreground">{report.warnings.length}</b></span>
          <span>Anomalías: <b className="text-foreground">{report.anomalies.length}</b></span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se recomienda validar el G-code antes de ejecutarlo en una máquina real.
      </p>

      {report && (report.warnings.length > 0 || report.anomalies.length > 0) && (
        <div className="max-h-24 overflow-auto rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200">
          {[...report.warnings, ...report.anomalies].map((item) => (
            <div key={item}>• {item}</div>
          ))}
        </div>
      )}

      {/* Visor con numeración SOLO visual (no se copia) */}
      <div className="flex-1 bg-background/50 border border-border rounded-lg overflow-auto min-h-0">
        <pre
          className="relative m-0 p-4 font-mono text-xs leading-5 gc-code"
          style={codeStyle}
        >
          {codeLines.map((ln, i) => (
            <span key={i} className="gc-line">
              {ln === "" ? " " : ln}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>

      {/* EL ARREGLO ESTÁ AQUÍ ABAJO.
        Las variables de color de Tailwind (shadcn) deben envolverse en hsl() 
        para que funcionen fuera de las clases de Tailwind (como en <style jsx>).
      */}
      <style jsx>{`
        .gc-code {
          counter-reset: ln;
          --gutter-color: var(--chart-3); /* si lo usabas */
        }

        /* Línea del gutter desactivada */
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
