import { GCODER_API_BASE_URL } from "@/lib/env"
import type { AnalyzeResponse, ConvertResponse, MachiningParams, ModelTransform } from "@/features/gcoder/types"

export type { AnalyzeResponse, ConvertResponse, MachiningParams, ModelTransform } from "@/features/gcoder/types"

export const DEFAULT_MACHINING_PARAMS: MachiningParams = {
  tool_diameter_mm: 3.175,
  step_down_mm: 1.0,
  step_over_mm: 1.5,
  feed_rate_mm_min: 800,
  plunge_rate_mm_min: 200,
  spindle_rpm: 12000,
  safe_z_mm: 5.0,
  stock_margin_mm: 3.0,
  strategy: "contour_parallel",
  tolerance_mm: 0.1,
  origin: "bottom_left",
  units: "mm",
}

function normalizeApiError(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return "No se pudo conectar con el backend. Verifica que FastAPI esté ejecutándose."
  }

  const message = error instanceof Error ? error.message : String(error || fallback)
  if (message.includes("Formato no soportado") || message.includes("extensión .stl")) {
    return "Formato no soportado. Por ahora el sistema solo acepta archivos STL."
  }
  if (message.includes("malla válida") || message.includes("STL") || message.includes("triángulos")) {
    return "El archivo STL no contiene una malla válida para conversión."
  }
  if (message.includes("compatible con mecanizado CNC")) {
    return "El modelo no parece compatible con mecanizado CNC router de 3 ejes."
  }
  if (message.includes("código G") || message.includes("G-code")) {
    return "No se pudo generar el código G. Revisa las advertencias del análisis."
  }
  return fallback
}

async function readApiError(response: Response, fallback: string) {
  const error = await response.json().catch(() => null)
  return normalizeApiError(new Error(error?.detail ?? fallback), fallback)
}

export async function analyzeStl(file: File, transform?: ModelTransform): Promise<AnalyzeResponse> {
  const formData = new FormData()
  formData.append("file", file)
  if (transform) {
    formData.append("transform", JSON.stringify(transform))
  }

  let response: Response
  try {
    response = await fetch(`${GCODER_API_BASE_URL}/api/analyze`, {
      method: "POST",
      body: formData,
    })
  } catch (error) {
    throw new Error(normalizeApiError(error, "Error al analizar el archivo STL"))
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, "Error al analizar el archivo STL"))
  }

  return response.json()
}

export async function convertStl(file: File, params: MachiningParams, transform?: ModelTransform): Promise<ConvertResponse> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("params", JSON.stringify(params))
  if (transform) {
    formData.append("transform", JSON.stringify(transform))
  }

  let response: Response
  try {
    response = await fetch(`${GCODER_API_BASE_URL}/api/convert`, {
      method: "POST",
      body: formData,
    })
  } catch (error) {
    throw new Error(normalizeApiError(error, "No se pudo generar el código G. Revisa las advertencias del análisis."))
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, "No se pudo generar el código G. Revisa las advertencias del análisis."))
  }

  return response.json()
}
