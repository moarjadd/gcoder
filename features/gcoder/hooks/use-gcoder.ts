"use client"

import type React from "react"
import { useCallback, useRef, useState } from "react"
// 💡 CORRECCIÓN 1: La firma de importación coincide con tu nuevo archivo
import { generateGCodeFromSTL, type ModelRotation as GCodeRotation } from "@/features/gcoder/lib/stl-to-gcode"
import analyzeConvexity, { type ConvexityAnalysis, type ModelRotation as AnalysisRotation } from "@/features/gcoder/lib/convexity"
import { Buffer } from "buffer" // shim Buffer para browser

// shim Buffer en navegador si hiciera falta
if (typeof window !== "undefined" && !(globalThis as any).Buffer) {
  ;(globalThis as any).Buffer = Buffer
}

type STLFileLite = { file: File; name: string; size: number }
type Analysis = ConvexityAnalysis | null 
type GCodeResult = { code: string; lines: number; estimatedTime: string }
// El estado de rotación (guardado en Radianes, Y-up, como pediste)
type ModelRotation = { x: number; y: number; z: number };

const MACHINABILITY_ERROR_STATE = {
  isThreeAxisMachable: false,
  accessibilityScore: 0,
  topFaceDownRatio: 1,
  undercutRatio: 1,
  samples: 0,
  details: "Error de análisis.",
}

export function useGcoder() {
  const [stlFile, setStlFile] = useState<STLFileLite | null>(null)
  const [stlData, setStlData] = useState<ArrayBuffer | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>(null) 
  const [isConverting, setIsConverting] = useState(false)
  const [gcode, setGcode] = useState<GCodeResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [modelRotation, setModelRotation] = useState<ModelRotation>({ x: 0, y: 0, z: 0 });

  // 🚨 NUEVO ESTADO DEBUG
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  // 🚨 NUEVA FUNCIÓN DEBUG
  const toggleDebugMode = useCallback(() => {
    setIsDebugMode(prev => !prev);
  }, []);


  const formatFileSize = (bytes: number): string =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(2)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`

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
  }, [analysis]); 
  // --- FIN DE LÓGICA DE ROTACIÓN INTACTA ---

  const fileToArrayBuffer = (file: File) => file.arrayBuffer()

  const handleFileUpload = (file: File, arrayBuffer: ArrayBuffer) => {
    setStlFile({ file, name: file.name, size: file.size })
    setStlData(arrayBuffer)
    setAnalysis(null)
    setGcode(null)
    setShowIntro(true)
    setModelRotation({ x: 0, y: 0, z: 0 });
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    const stl = files.find((f) => f.name.toLowerCase().endsWith(".stl"))
    if (stl) {
      const arr = await fileToArrayBuffer(stl)
      handleFileUpload(stl, arr)
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
    }
  }

  const onAnalyze = async () => {
    if (!stlData) return
    setShowIntro(false)
    setIsAnalyzing(true)
    
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

    try {
      const buf = Buffer.from(new Uint8Array(stlData))
      
      const res = analyzeConvexity(
        buf, 
        { tolerance: 0.98, badGap: 0.05 },
        rotationForAnalyzer // Pasa Grados (Z-up)
      )
      
      setAnalysis(res) // Pasa el objeto 'res' completo

    } catch (err: any) {
      setAnalysis({
        isConvex: false,
        meshVolume: 0,
        hullVolume: 0,
        convexityRatio: 0,
        confidence: 0,
        machinability: MACHINABILITY_ERROR_STATE,
        error: `Error analizando convexidad: ${err?.message || String(err)}`,
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 💡 CORRECCIÓN: Función actualizada con tu nueva lógica
  const convertToGCode = async () => {
    // 💡 CORRECCIÓN DE TESIS: Chequea fabricabilidad, no convexidad.
    if (!stlFile || !stlData || !analysis?.machinability?.isThreeAxisMachable) return
    
    setIsConverting(true)
    
    // 💡 CORRECCIÓN DE EJES:
    // El estado (modelRotation) está en Radianes (Y-up)
    // El G-coder (generateGCodeFromSTL) espera Radianes (Z-up)
    const rotationForGCode: GCodeRotation = {
      x: modelRotation.x,
      y: modelRotation.z, // Swap Y/Z
      z: modelRotation.y  // Swap Y/Z
    }
    
    try {
      // Usa la nueva firma de función (con 'rotation' como 2do arg)
      const result = generateGCodeFromSTL(
        stlData,
        rotationForGCode, // Pasa Radianes (Z-up)
        // Parámetros para CNC (topDown: true)
        { layerHeight: 0.5, contourTol: 0.01, zigzag: true, closeLoops: true, topDown: true },
        { zSafe: 5.0, leadIn: 0.5, feedXY: 600.0, feedZ: 300.0 },
        {
          unitsMm: true,
          absolute: true,
          spindleOn: true,
          spindleRpm: 1000,
          zSafe: 5.0,
          programName: "STL_WATERLINE",
          commentPrefix: "; ",
          precision: 3,
        },
      )
      setGcode({ code: result.gcode, lines: result.lines, estimatedTime: `${Math.floor(result.lines / 100)}min` })
    } catch (err: any) { // Mejor manejo de errores
      console.error("Error al generar G-code:", err);
      const sample = `; G-code falló. Error: ${err?.message || 'Unknown'}`
      setGcode({
        code: sample,
        lines: 1,
        estimatedTime: "0min",
      })
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
    setGcode(null)
    setShowIntro(true)
    setIsExpanded(false)
    setModelRotation({ x: 0, y: 0, z: 0 });
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const onDownloadGCode = () => {
    if (!gcode) return
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([gcode.code], { type: "text/plain" }))
    a.download = (stlFile?.name || "output").replace(/\.stl$/i, ".gcode")
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return {
    stlFile,
    stlData,
    isAnalyzing,
    analysis,
    isConverting,
    gcode,
    dragActive,
    showIntro,
    isExpanded,
    formatFileSize,
    fileInputRef,
    modelRotation,
    rotateModel,
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
