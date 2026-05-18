import type { ModelTransform } from "./transform"

export type StockDimensions = {
  x: number
  y: number
  z: number
}

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
    classification_reasons: string[]
    warning_codes: string[]
    warning_details: Record<string, unknown>
    threshold_values: Record<string, unknown>
    measured_values: Record<string, unknown>
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
    lost_holes_detected: boolean
    geometry_repair_used: boolean
    rmse_mm: number | null
    max_error_mm: number | null
    mean_error_mm: number | null
    area_error_percent: number | null
    compared_layers: number
    skipped_layers: number
    hole_preservation_rate: number | null
    total_holes_detected: number
    total_holes_preserved: number
    layer_geometry_warnings: string[]
    model_dimensions_mm: StockDimensions
    algorithm_stock_mm: StockDimensions
    recommended_physical_stock_mm: StockDimensions
    stock_margin_xy_mm: number
    recommended_margin_xy_mm: number
    recommended_extra_z_mm: number
    tool_diameter_mm: number
    skipped_layers_count: number
    invalid_toolpath_layers_count: number
    work_origin_assumption: string
    z_zero_assumption: string
    stock_notes: string[]
    estimated_offset_passes_per_layer: number
    estimated_operation_complexity: number
    recommended_max_layers: number
    estimated_layer_count: number
    step_down_layer_warning: boolean
    step_over_offset_warning: boolean
    conversion_total_ms: number
    mesh_load_ms: number
    transform_ms: number
    analysis_ms: number
    slicing_ms: number
    toolpath_ms: number
    postprocess_ms: number
    metrics_ms: number
    conversion_total_human: string
    slicing_human: string
    toolpath_human: string
    postprocess_human: string
  }
  transformApplied: ModelTransform
}
