import type { ModelTransform } from "./transform"

export type MeshDimensions = {
  x: number
  y: number
  z: number
}

export type AnalyzeResponse = {
  filename: string
  fileSizeBytes?: number
  mesh?: {
    triangleCount: number
    vertexCount: number
    isEmpty: boolean
    isWatertight: boolean
    isWindingConsistent: boolean
    bounds: {
      min: number[] | null
      max: number[] | null
    }
    dimensions: MeshDimensions
    volumeApproxMm3: number | null
  }
  triangleCount: number
  vertexCount: number
  bounds: {
    min: number[]
    max: number[]
    size: number[]
  }
  validation: {
    isWatertight: boolean
    isWindingConsistent: boolean
    isEmpty: boolean
    faceCount: number
    vertexCount: number
    degenerateFacesCount: number
    bounds: {
      min: number[] | null
      max: number[] | null
    } | null
    dimensions: number[]
    isValid: boolean
    warnings: string[]
    errors: string[]
    warningCodes?: string[]
    errorCodes?: string[]
    thresholdValues?: Record<string, unknown>
    measuredValues?: Record<string, unknown>
  }
  dimensions: number[]
  volumeApprox: number | null
  machinability: {
    isThreeAxisMachinable: boolean
    isLikelyConvex: boolean
    hasPotentialUndercuts: boolean
    accessibilityScore: number
    baseFlatnessScore: number
    warnings: string[]
    errors: string[]
    explanation: string
    details: Record<string, unknown>
    warningCodes?: string[]
    errorCodes?: string[]
    thresholdValues?: Record<string, unknown>
    measuredValues?: Record<string, unknown>
    debug?: Record<string, unknown>
  }
  warnings: string[]
  errors: string[]
  thesisFriendlyStatus: string
  classification_reasons: string[]
  warning_codes: string[]
  warning_details: Record<string, unknown>
  machinability_debug: Record<string, unknown>
  threshold_values: Record<string, unknown>
  measured_values: Record<string, unknown>
  processingTimeSeconds?: number
  analysis_total_ms: number
  mesh_load_ms: number
  transform_ms: number
  validation_ms: number
  metrics_ms: number
  machinability_ms: number
  classification_ms: number
  analysis_total_human: string
  transformApplied: ModelTransform
}
