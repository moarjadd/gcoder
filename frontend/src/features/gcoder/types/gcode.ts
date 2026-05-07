import type { ModelTransform } from "./transform"

export type ConvertResponse = {
  status: "success" | "error"
  filename: string
  gcode: string
  linesCount: number
  estimatedSummary: {
    layers: number
    moves: number
    pathLengthMm: number
    note: string
  }
  report: {
    conversionSuccess: boolean
    processingTimeSeconds: number
    layersCount: number
    toolpathMovesCount: number
    warnings: string[]
    anomalies: string[]
    metrics: Record<string, unknown>
  }
  transformApplied: ModelTransform
}
