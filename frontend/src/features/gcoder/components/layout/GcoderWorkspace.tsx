"use client"
import { Code, Eye, FileText, Settings } from "lucide-react"
import { cn } from "@/lib/cn"
import { useGcoder } from "@/features/gcoder/hooks/useGcoder"
import StlUploader from "@/features/gcoder/components/upload/StlUploader"
import MeshAnalysisCard from "@/features/gcoder/components/analysis/MeshAnalysisCard"
import Preview3D from "@/features/gcoder/components/viewer/Preview3D"
import GCodePreview from "@/features/gcoder/components/gcode/GCodePreview"
import MachiningParametersForm from "@/features/gcoder/components/parameters/MachiningParametersForm"

export default function GcoderWorkspace() {
  const {
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
    onDrop,
    onDragOver,
    onDragLeave,
    onFileSelect,
    onAnalyze,
    onRemoveFile,
    onToggleExpandAndGenerate,
    onDownloadGCode,
    modelRotation,
    modelScale,
    modelDimensions,
    setModelDimensions,
    isModelModified,
    isTransformPending,
    rotateModel,
    updateModelScale,
    resetModelTransform,
    isDebugMode,
    toggleDebugMode,
  } = useGcoder()
  const showDebugToggle = process.env.NEXT_PUBLIC_GCODER_DEBUG === "true"

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden relative">
      <div className="fixed inset-0 z-0 geometric-pattern opacity-30" />

      <div className="relative z-10 flex-1 flex w-full flex-col items-center justify-start px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 text-center lg:mb-8">
          <h1 className="text-4xl font-bold text-foreground flex items-center justify-center gap-3">
            <Settings className="w-10 h-10 text-primary" />
            G-coder
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Conversor de archivos STL a G-code para CNC Router de 3 ejes
          </p>
        </div>

        <div className="w-full max-w-[1800px] mx-auto">
          <div className="w-full bg-card/80 backdrop-blur-sm border border-border p-4 sm:p-6 rounded-xl min-h-[clamp(500px,calc(100vh-11rem),820px)] flex">
            <div
              className={cn(
                "grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] h-auto transition-all duration-500 ease-in-out flex-1 gap-6",
                isExpanded && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
              )}
            >
              {/* ===== COLUMNA 1: ENTRADA / ANÁLISIS ===== */}
              <div
                className={cn(
                  "space-y-0 transition-all duration-500 ease-in-out overflow-hidden",
                  isExpanded
                    ? "opacity-0 -translate-x-8 pointer-events-none max-h-0 lg:hidden"
                    : "opacity-100 translate-x-0 max-h-none",
                )}
              >
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-500 ease-out",
                    "bg-primary/10 border border-primary/20 rounded-lg",
                    showIntro ? "max-h-72 p-6 opacity-100" : "max-h-0 p-0 opacity-0",
                  )}
                >
                  <div className={cn("transition-opacity duration-300", showIntro ? "opacity-100" : "opacity-0")}>
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                      <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-primary">
                          Convierte modelos STL válidos y fabricables en 3 ejes a G-code básico para CNC Router.
                        </h2>

                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm text-muted-foreground">Carga tu archivo para verlo al instante en el navegador</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Rota y posiciona el modelo en la plataforma virtual.</li>
                              <li>• Analiza la malla y verifica compatibilidad con CNC router de 3 ejes.</li>
                              <li>• Continúa para crear G-code básico y revisar su reporte.</li>
                            </ul>
                          </div>
                          {showDebugToggle && (
                            <div className="flex flex-col items-center mt-1">
                              <span className="text-xs font-bold text-primary mb-1">Modo diagnóstico</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={isDebugMode} onChange={toggleDebugMode} className="sr-only peer" />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 dark:peer-focus:ring-primary/80 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {showIntro && <div className="border-b border-border my-6" />}

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Entrada</h3>
                    <div className="px-3 py-1 bg-primary text-primary-foreground text-sm rounded-full font-medium">
                      Archivo STL
                    </div>
                  </div>

                  <StlUploader
                    stlFile={stlFile}
                    dragActive={dragActive}
                    formatFileSize={formatFileSize}
                    fileInputRef={fileInputRef}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onFileSelect={onFileSelect}
                    onAnalyze={onAnalyze}
                    onRemoveFile={onRemoveFile}
                    isAnalyzing={isAnalyzing}
                    analyzeLabel={isTransformPending && backendAnalysis ? "Reanalizar" : "Analizar"}
                  />

                  {stlFile && !showIntro && (
                    <div className="space-y-4">
                      <MeshAnalysisCard
                        isAnalyzing={isAnalyzing}
                        analysis={analysis}
                        backendAnalysis={backendAnalysis}
                        backendAnalysisError={backendAnalysisError}
                        isDebugMode={isDebugMode}
                      />
                      {backendAnalysis?.machinability?.isThreeAxisMachinable && (
                        <MachiningParametersForm
                          params={machiningParams}
                          disabled={isConverting}
                          onChange={setMachiningParams}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ===== COLUMNA 2: VISTA PREVIA 3D ===== */}
              <div
                className={cn(
                  "flex flex-col transition-all duration-500 ease-in-out",
                  "lg:mt-0",
                  isExpanded ? "mt-0" : "mt-6",
                )}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Vista Previa 3D</h3>
                </div>

                <Preview3D
                  data={stlData ?? undefined}
                  canExpand={!!backendAnalysis?.machinability?.isThreeAxisMachinable && !isTransformPending}
                  isConverting={isConverting}
                  isExpanded={isExpanded}
                  onToggleExpandAndGenerate={onToggleExpandAndGenerate}
                  className={cn("min-h-[clamp(450px,calc(100vh-18rem),680px)]", showIntro && "flex-1 lg:h-full")}
                  modelRotation={modelRotation}
                  rotateModel={rotateModel}
                  modelScale={modelScale}
                  onScaleChange={updateModelScale}
                  onResetTransform={resetModelTransform}
                  dimensions={modelDimensions}
                  onDimensionsChange={setModelDimensions}
                  isModelModified={isModelModified}
                  isAnalyzed={!!analysis || !!backendAnalysis}
                />
              </div>

              {/* ===== COLUMNA 3: GENERACIÓN DEL G-CODE (altura limitada como Preview) ===== */}
              <div
                className={cn(
                  "flex flex-col transition-all duration-500 ease-in-out",
                  "lg:mt-0",
                  isExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 translate-x-8 pointer-events-none max-h-0 lg:hidden",
                )}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Code className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Generación del G-code</h3>
                </div>

                {/* Contenedor fijo y scrolleable (≈ mismo alto que Preview3D) */}
                <div className="border border-border rounded-lg bg-muted/30">
                  <div className="px-4 py-4 sm:px-6 h-[clamp(500px,calc(100vh-18rem),720px)] overflow-y-auto">
                    {gcode ? (
                      <GCodePreview
                        lines={gcode.lines}
                        estimatedTime={gcode.estimatedTime}
                        code={gcode.code}
                        report={conversionReport ?? gcode.report}
                        onDownload={onDownloadGCode}
                      />
                    ) : conversionError ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="max-w-md rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                          <p className="font-medium text-red-300">No se pudo generar G-code</p>
                          <p className="mt-2 text-sm text-muted-foreground">{conversionError}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-3">
                          <div className="w-12 h-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-foreground font-medium">Generando G-code...</p>
                          <p className="text-sm text-muted-foreground">Esto puede tomar unos momentos</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* ===== FIN COLUMNA 3 ===== */}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
