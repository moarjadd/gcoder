import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import UploadArea from "@/features/gcoder/components/UploadArea"

describe("UploadArea", () => {
  const baseProps = {
    stlFile: null,
    dragActive: false,
    formatFileSize: (n: number) => `${n} bytes`,
    fileInputRef: React.createRef<HTMLInputElement>(),
    onDrop: jest.fn(),
    onDragOver: jest.fn(),
    onDragLeave: jest.fn(),
    onFileSelect: jest.fn(),
    onAnalyze: jest.fn(),
    onRemoveFile: jest.fn(),
    isAnalyzing: false,
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("deshabilita los botones cuando no hay archivo seleccionado", () => {
    render(<UploadArea {...baseProps} />)

    const analyzeButton = screen.getByRole("button", {
      name: /selecciona un archivo/i,
    })
    expect(analyzeButton).toBeDisabled()

    const removeButton = screen.getByRole("button", { name: /quitar archivo/i })
    expect(removeButton).toBeDisabled()
  })

  it("muestra los datos del archivo y habilita las acciones", () => {
    const props = {
      ...baseProps,
      stlFile: { name: "pieza.stl", size: 1024 },
    }

    render(<UploadArea {...props} />)

    expect(screen.getByText("pieza.stl")).toBeInTheDocument()

    const analyzeButton = screen.getByRole("button", { name: /analizar/i })
    expect(analyzeButton).toBeEnabled()

    const removeButton = screen.getByRole("button", { name: /quitar archivo/i })
    expect(removeButton).toBeEnabled()
  })

  it("llama a los callbacks al hacer click en Analizar y Quitar", () => {
    const onAnalyze = jest.fn()
    const onRemoveFile = jest.fn()

    render(
      <UploadArea
        {...baseProps}
        stlFile={{ name: "pieza.stl", size: 1024 }}
        onAnalyze={onAnalyze}
        onRemoveFile={onRemoveFile}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /analizar/i }))
    fireEvent.click(screen.getByRole("button", { name: /quitar archivo/i }))

    expect(onAnalyze).toHaveBeenCalledTimes(1)
    expect(onRemoveFile).toHaveBeenCalledTimes(1)
  })
})
