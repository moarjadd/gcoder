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
  }
  warnings: string[]
  errors: string[]
  thesisFriendlyStatus: string
  processingTimeSeconds?: number
  transformApplied: ModelTransform
}
