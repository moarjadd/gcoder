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
    machining_semantics: string
    stock_margin_mm: number
    tool_radius_mm: number
    uses_internal_pocket: boolean
    convex_hull_fallback_used: boolean
    slicing_fallback_used: boolean
    geometry_preservation_warning: boolean
    concavity_detected: boolean
    concavity_preserved: boolean
    detail_loss_risk: boolean
    tool_diameter_mm: number
    skipped_layers_count: number
    invalid_toolpath_layers_count: number
  }
  transformApplied: ModelTransform
}
