"use client"

import type React from "react"
import { useCallback, useRef, useState } from "react"
import analyzeConvexity, { type ConvexityAnalysis, type ModelRotation as AnalysisRotation } from "@/features/gcoder/legacy/convexity"
import {
  analyzeStl,
  convertStl,
  DEFAULT_MACHINING_PARAMS,
  type AnalyzeResponse,
  type ConvertResponse,
  type MachiningParams,
  type ModelTransform,
} from "@/features/gcoder/api/gcoderClient"
import { downloadTextFile } from "@/features/gcoder/utils/download"
import { fileToArrayBuffer, type STLFileLite } from "@/features/gcoder/utils/file"
import { formatFileSize } from "@/features/gcoder/utils/formatting"
import { Buffer } from "buffer" // shim Buffer para browser

// shim Buffer en navegador si hiciera falta
type GlobalWithBuffer = typeof globalThis & { Buffer?: typeof Buffer }

const globalWithBuffer = globalThis as GlobalWithBuffer

if (typeof window !== "undefined" && !globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer
}

type Analysis = ConvexityAnalysis | null 
type GCodeResult = { code: string; lines: number; estimatedTime: string; report?: ConvertResponse["report"] }
// El estado de rotación (guardado en Radianes, Y-up, como pediste)
type ModelRotation = { x: number; y: number; z: number };
type ModelDimensions = { x: number; y: number; z: number };

const MACHINABILITY_ERROR_STATE = {
  isThreeAxisMachable: false,
  accessibilityScore: 0,
  topFaceDownRatio: 1,
  undercutRatio: 1,
  overhangRatio: 1,
  baseFlatRatio: 0,
  samples: 0,
  details: "Error de análisis.",
}

function rotationToBackendTransform(modelRotation: ModelRotation, scale: number): ModelTransform {
  return {
    rotation_x_deg: modelRotation.x * (180 / Math.PI),
    rotation_y_deg: modelRotation.z * (180 / Math.PI),
    rotation_z_deg: modelRotation.y * (180 / Math.PI),
    scale,
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useGcoder() {
  const [stlFile, setStlFile] = useState<STLFileLite | null>(null)
  const [stlData, setStlData] = useState<ArrayBuffer | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>(null) 
  const [backendAnalysis, setBackendAnalysis] = useState<AnalyzeResponse | null>(null)
  const [backendAnalysisError, setBackendAnalysisError] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [conversionReport, setConversionReport] = useState<ConvertResponse["report"] | null>(null)
  const [machiningParams, setMachiningParams] = useState<MachiningParams>(DEFAULT_MACHINING_PARAMS)
  const [gcode, setGcode] = useState<GCodeResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [modelRotation, setModelRotation] = useState<ModelRotation>({ x: 0, y: 0, z: 0 });
  const [modelScale, setModelScale] = useState(1)
  const [modelDimensions, setModelDimensions] = useState<ModelDimensions | null>(null)
  const [transformRevision, setTransformRevision] = useState(0)
  const [analyzedTransformRevision, setAnalyzedTransformRevision] = useState(0)
  const [analyzedTransform, setAnalyzedTransform] = useState<ModelTransform | null>(null)

  // 🚨 NUEVO ESTADO DEBUG
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  // 🚨 NUEVA FUNCIÓN DEBUG
  const toggleDebugMode = useCallback(() => {
    setIsDebugMode(prev => !prev);
  }, []);


  // --- LÓGICA DE ROTACIÓN INTACTA (Guarda Radianes, Y-up) ---
  const rotateModel = useCallback((axis: 'x' | 'y' | 'z', degrees: number) => {
    const radians = degrees * (Math.PI / 180);
    setModelRotation(prev => ({
      ...prev,
      [axis]: (prev[axis] + radians) % (2 * Math.PI) 
    }));
    if (analysis) {
        setAnalysis(null)
    }
    setGcode(null)
    setConversionReport(null)
    setTransformRevision((revision) => revision + 1)
  }, [analysis]); 
  // --- FIN DE LÓGICA DE ROTACIÓN INTACTA ---

  const updateModelScale = useCallback((scale: number) => {
    const nextScale = Math.min(5, Math.max(0.1, scale))
    setModelScale(nextScale)
    if (analysis) {
      setAnalysis(null)
    }
    setGcode(null)
    setConversionReport(null)
    setTransformRevision((revision) => revision + 1)
  }, [analysis])

  const resetModelTransform = useCallback(() => {
    setModelRotation({ x: 0, y: 0, z: 0 })
    setModelScale(1)
    if (analysis) {
      setAnalysis(null)
    }
    setGcode(null)
    setConversionReport(null)
    setTransformRevision((revision) => revision + 1)
  }, [analysis])

  const handleFileUpload = (file: File, arrayBuffer: ArrayBuffer) => {
    if (!file.name.toLowerCase().endsWith(".stl")) {
      setBackendAnalysisError("Formato no soportado. Por ahora el sistema solo acepta archivos STL.")
      return
    }
    setStlFile({ file, name: file.name, size: file.size })
    setStlData(arrayBuffer)
    setAnalysis(null)
    setBackendAnalysis(null)
    setBackendAnalysisError(null)
    setConversionError(null)
    setConversionReport(null)
    setGcode(null)
    setShowIntro(true)
    setModelRotation({ x: 0, y: 0, z: 0 });
    setModelScale(1)
    setModelDimensions(null)
    setTransformRevision(0)
    setAnalyzedTransformRevision(0)
    setAnalyzedTransform(null)
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    const stl = files.find((f) => f.name.toLowerCase().endsWith(".stl"))
    if (stl) {
      const arr = await fileToArrayBuffer(stl)
      handleFileUpload(stl, arr)
    } else if (files.length > 0) {
      setBackendAnalysisError("Formato no soportado. Por ahora el sistema solo acepta archivos STL.")
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.name.toLowerCase().endsWith(".stl")) {
      const arr = await fileToArrayBuffer(file)
      handleFileUpload(file, arr)
    } else if (file) {
      setBackendAnalysisError("Formato no soportado. Por ahora el sistema solo acepta archivos STL.")
    }
  }

  const onAnalyze = async () => {
    if (!stlFile || !stlData) return
    setShowIntro(false)
    setIsAnalyzing(true)
    setBackendAnalysis(null)
    setBackendAnalysisError(null)
    const requestedTransformRevision = transformRevision
    
    // --- LÓGICA DE ROTACIÓN Z-UP INTACTA ---
    // El estado (modelRotation) está en Radianes (Y-up)
    // El analizador (analyzeConvexity) espera Grados (Z-up)
    const radY_up = modelRotation; 
    const rotationForAnalyzer: AnalysisRotation = { // (GRADOS, Z-up)
      x: radY_up.x * (180 / Math.PI),
      y: radY_up.z * (180 / Math.PI), // Swap Y/Z + Convert
      z: radY_up.y * (180 / Math.PI), // Swap Y/Z + Convert
    }
    // --- FIN DE LÓGICA DE ROTACIÓN Z-UP INTACTA ---

    const backendTransform = rotationToBackendTransform(modelRotation, modelScale)
    const backendPromise = analyzeStl(stlFile.file, backendTransform)

    try {
      const buf = Buffer.from(new Uint8Array(stlData))
      
      const res = analyzeConvexity(
        buf, 
        { tolerance: 0.98, badGap: 0.05 },
        rotationForAnalyzer // Pasa Grados (Z-up)
      )
      
      setAnalysis(res) // Pasa el objeto 'res' completo

    } catch (err: unknown) {
      setAnalysis({
        isConvex: false,
        meshVolume: 0,
        hullVolume: 0,
        convexityRatio: 0,
        confidence: 0,
        machinability: MACHINABILITY_ERROR_STATE,
        error: `Error analizando convexidad: ${getErrorMessage(err, String(err))}`,
      })
    }

    try {
      const backendResult = await backendPromise
      setBackendAnalysis(backendResult)
      setAnalyzedTransformRevision(requestedTransformRevision)
      setAnalyzedTransform(backendResult.transformApplied)
    } catch (backendErr: unknown) {
      setBackendAnalysisError(getErrorMessage(backendErr, "Error al analizar el STL en el backend."))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const convertToGCode = async () => {
    if (!stlFile || !backendAnalysis?.machinability?.isThreeAxisMachinable || isTransformPending) return
    
    setIsConverting(true)
    setConversionError(null)
    setConversionReport(null)
    
    try {
      const result = await convertStl(stlFile.file, machiningParams, analyzedTransform ?? rotationToBackendTransform(modelRotation, modelScale))
      setConversionReport(result.report)
      setGcode({
        code: result.gcode,
        lines: result.linesCount,
        estimatedTime: `${result.report.conversion_total_human ?? `${result.report.processingTimeSeconds.toFixed(2)}s`} proceso`,
        report: result.report,
      })
    } catch (err: unknown) { // Mejor manejo de errores
      console.error("Error al generar G-code:", err);
      setConversionError(getErrorMessage(err, "Error al convertir el STL en el backend."))
      setGcode(null)
    }
    setIsConverting(false)
  }

  const onToggleExpandAndGenerate = () => {
    if (isExpanded) {
      setIsExpanded(false)
    } else {
      setIsExpanded(true)
      setTimeout(() => {
        convertToGCode()
      }, 100)
    }
  }

  const onRemoveFile = () => {
    setStlFile(null)
    setStlData(null)
    setAnalysis(null)
    setBackendAnalysis(null)
    setBackendAnalysisError(null)
    setConversionError(null)
    setConversionReport(null)
    setGcode(null)
    setShowIntro(true)
    setIsExpanded(false)
    setModelRotation({ x: 0, y: 0, z: 0 });
    setModelScale(1)
    setModelDimensions(null)
    setTransformRevision(0)
    setAnalyzedTransformRevision(0)
    setAnalyzedTransform(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const isModelModified =
    modelScale !== 1 ||
    modelRotation.x !== 0 ||
    modelRotation.y !== 0 ||
    modelRotation.z !== 0
  const isTransformPending = transformRevision !== analyzedTransformRevision

  const onDownloadGCode = () => {
    if (!gcode) return
    downloadTextFile((stlFile?.name || "gcoder-output").replace(/\.stl$/i, ".nc"), gcode.code)
  }

  return {
    stlFile,
    stlData,
    isAnalyzing,
    analysis,
    backendAnalysis,
    backendAnalysisError,
    isConverting,
    gcode,
    conversionError,
    conversionReport,
    machiningParams,
    setMachiningParams,
    dragActive,
    showIntro,
    isExpanded,
    formatFileSize,
    fileInputRef,
    modelRotation,
    modelScale,
    modelDimensions,
    setModelDimensions,
    isModelModified,
    isTransformPending,
    analyzedTransform,
    rotateModel,
    updateModelScale,
    resetModelTransform,
    onDrop,
    onDragOver,
    onDragLeave,
    onFileSelect,
    onAnalyze,
    onRemoveFile,
    onToggleExpandAndGenerate,
    onDownloadGCode,
    // 🚨 AÑADE LAS NUEVAS PROPIEDADES AL RETORNO
    isDebugMode,
    toggleDebugMode,
  }
}
