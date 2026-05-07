"use client"

import { Upload, Search, Trash2, Loader2, Box } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import * as React from "react"

type STLFileLite = { name: string; size: number } | null

type Props = {
  stlFile: STLFileLite
  dragActive: boolean
  formatFileSize: (bytes: number) => string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAnalyze: () => void
  onRemoveFile: () => void
  isAnalyzing: boolean
  analyzeLabel?: string
}

export default function StlUploader({
  stlFile,
  dragActive,
  formatFileSize,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onAnalyze,
  onRemoveFile,
  isAnalyzing,
  analyzeLabel = "Analizar",
}: Props) {
  const dropzoneId = "stl-file"

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }

  const noFile = !stlFile

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Carga un modelo STL válido para iniciar el análisis:</p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Área para subir archivo STL. Presiona Enter o Espacio para abrir el selector."
        aria-busy={isAnalyzing ? "true" : "false"}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          dragActive
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50 bg-muted/30",
          isAnalyzing ? "cursor-not-allowed" : "cursor-pointer"
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
        onKeyDown={handleKey}
        aria-describedby="stl-helper"
      >
        {stlFile ? (
          <div className="space-y-3">
            {/* Icono 3D usando lucide-react */}
            <Box className="w-12 h-12 mx-auto text-primary" strokeWidth={1.75} aria-hidden />
            <div className="mx-auto max-w-sm">
              <p className="font-medium text-foreground truncate" title={stlFile.name}>
                {stlFile.name}
              </p>
              <p className="text-sm text-muted-foreground">{formatFileSize(stlFile.size)}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground" aria-hidden />
            <div>
              <p className="text-foreground font-medium">Arrastra tu archivo STL aquí</p>
              <p id="stl-helper" className="text-sm text-muted-foreground">
                o presiona para seleccionar un archivo .stl
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          id={dropzoneId}
          type="file"
          accept=".stl,.STL,model/stl"
          className="sr-only"
          onChange={onFileSelect}
        />
        <label htmlFor={dropzoneId} className="sr-only">
          Seleccionar archivo STL
        </label>
      </div>

      <div className="flex gap-3" aria-live="polite">
        <Button
          onClick={noFile ? () => fileInputRef.current?.click() : onAnalyze}
          disabled={isAnalyzing}
          aria-disabled={isAnalyzing ? true : undefined}
          className={cn(
            "flex-1 h-12 text-base font-semibold transition-all",
            "focus:ring-2 focus:ring-primary/50",
            isAnalyzing ? "opacity-80 cursor-wait" : "hover:bg-primary/90 cursor-pointer"
          )}
          size="lg"
          title={
            isAnalyzing
              ? "Procesando archivo…"
              : noFile
              ? "Cargar archivo STL"
              : "Analizar archivo"
          }
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
              Cargando…
            </>
          ) : noFile ? (
            <>
              <Upload className="w-4 h-4 mr-2" aria-hidden />
              Cargar archivo STL
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" aria-hidden />
              {analyzeLabel}
            </>
          )}
        </Button>

        {!noFile && (
          <Button
            onClick={onRemoveFile}
            disabled={isAnalyzing}
            variant="outline"
            title="Quitar archivo"
            aria-label="Quitar archivo"
            className={cn(
              "group h-12 px-4 transition-colors focus:ring-2 focus:ring-destructive/50",
              isAnalyzing ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-destructive hover:text-white hover:border-destructive"
            )}
            size="lg"
          >
            <Trash2
              className="w-4 h-4 transition-colors text-current group-hover:text-white [fill:none] [stroke:currentColor]"
              aria-hidden
            />
          </Button>
        )}
      </div>
    </div>
  )
}
