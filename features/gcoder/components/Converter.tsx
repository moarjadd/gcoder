"use client"
import { Code, Eye, FileText, Settings } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { useGcoder } from "@/features/gcoder/hooks/use-gcoder"
import UploadArea from "@/features/gcoder/components/UploadArea"
import AnalysisBlock from "@/features/gcoder/components/AnalysisBlock"
import Preview3D from "@/features/gcoder/components/Preview3D"
import GcodePanel from "@/features/gcoder/components/GcodePanel"

export default function Converter() {
  const {
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
    onDrop,
    onDragOver,
    onDragLeave,
    onFileSelect,
    onAnalyze,
    onRemoveFile,
    onToggleExpandAndGenerate,
    onDownloadGCode,
    modelRotation,
    rotateModel,
    isDebugMode,
    toggleDebugMode,
  } = useGcoder()

  // Copiar al portapapeles desde aquí para el header sticky
  const handleCopy = async () => {
    if (gcode?.code) {
      try { await navigator.clipboard.writeText(gcode.code) } catch {}
    }
  }

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      <div className="fixed inset-0 z-0 geometric-pattern opacity-30" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground flex items-center justify-center gap-3">
            <Settings className="w-10 h-10 text-primary" />
            G-coder
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Conversor de archivos STL a G-code para CNC Router de 3 ejes
          </p>
        </div>

        <div className="w-full mx-auto px-0 md:px-0 lg:px-8 xl:px-12 2xl:px-24">
          <div className="w-full bg-card/80 backdrop-blur-sm border border-border p-6 rounded-xl min-h-[500px] flex">
            <div
              className={cn(
                "grid grid-cols-1 lg:grid-cols-2 h-auto transition-all duration-500 ease-in-out flex-1 lg:gap-6",
              )}
            >
              {/* ===== COLUMNA 1: ENTRADA / ANÁLISIS ===== */}
              <div
                className={cn(
                  "space-y-0 transition-all duration-500 ease-in-out overflow-hidden",
                  isExpanded
                    ? "opacity-0 -translate-x-8 pointer-events-none max-h-0 lg:hidden"
                    : "opacity-100 translate-x-0 max-h-[1000px]",
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
                        <h2 className="text-lg font-semibold text-primary">Convierte tu STL a G-code para máquinas CNC Router (3 ejes)</h2>

                        {/* DEBUG a la derecha */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm text-muted-foreground">Carga tu archivo para verlo al instante en el navegador</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Rota y posiciona el modelo en la plataforma virtual.</li>
                              <li>• Verifica si el modelo cumple con las condiciones necesarias.</li>
                              <li>• Continúa para crear el G-code listo para usar.</li>
                            </ul>
                          </div>
                          <div className="flex flex-col items-center mt-1">
                            <span className="text-xs font-bold text-primary mb-1">DEBUG</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={isDebugMode} onChange={toggleDebugMode} className="sr-only peer" />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 dark:peer-focus:ring-primary/80 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                            </label>
                          </div>
                        </div>
                        {/* FIN DEBUG */}
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

                  <UploadArea
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
                  />

                  {stlFile && !showIntro && (
                    <AnalysisBlock
                      isAnalyzing={isAnalyzing}
                      analysis={analysis}
                      isDebugMode={isDebugMode}
                    />
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
                  canExpand={!!analysis?.machinability?.isThreeAxisMachable}
                  isConverting={isConverting}
                  isExpanded={isExpanded}
                  onToggleExpandAndGenerate={onToggleExpandAndGenerate}
                  className={cn("min-h-[450px]", showIntro && "flex-1 lg:h-full")}
                  modelRotation={modelRotation}
                  rotateModel={rotateModel}
                  isAnalyzed={!!analysis}
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
                  <div className="px-6 py-4 h-[550px] overflow-y-auto"> 
                    {gcode ? (
                      <GcodePanel
                        lines={gcode.lines}
                        estimatedTime={gcode.estimatedTime}
                        code={gcode.code}
                        onDownload={onDownloadGCode}
                      />
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
