import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import GcodePanel from "../GcodePanel"

describe("GcodePanel", () => {
  const baseProps = {
    lines: 123,
    estimatedTime: "5 min",
    code: "G1 X10 Y10\nG1 X20 Y20",
    onDownload: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("muestra el G-code y los metadatos (líneas y tiempo)", () => {
    render(<GcodePanel {...baseProps} />)
    expect(screen.getByText(/G1 X10 Y10/i)).toBeInTheDocument()
    expect(screen.getByText(/123/)).toBeInTheDocument()
    expect(screen.getByText(/5\s*min/i)).toBeInTheDocument()
  })

  it("llama a onDownload cuando se hace clic en el botón de descarga", () => {
    render(<GcodePanel {...baseProps} />)
    const downloadButton = screen.getByRole("button", { name: /descargar/i })
    fireEvent.click(downloadButton)
    expect(baseProps.onDownload).toHaveBeenCalledTimes(1)
  })

  it("intenta copiar el G-code al portapapeles si existe un botón de 'Copiar'", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)

    Object.assign(navigator as any, {
      clipboard: { writeText },
    })

    render(<GcodePanel {...baseProps} />)

    const copyButton = screen.queryByRole("button", { name: /copiar/i })
    if (!copyButton) return

    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(baseProps.code)
    await screen.findByText("¡Copiado!")
  })
})