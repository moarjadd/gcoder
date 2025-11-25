import * as React from "react"
import { render, screen } from "@testing-library/react"
import AnalysisBlock from "../AnalysisBlock"

describe("AnalysisBlock", () => {
  const baseAnalysis = {
    // Campos reales
    isConvex: true,
    convexityRatio: 1,
    meshVolume: 1000,
    hullVolume: 1000,
    machinability: {
      isThreeAxisMachable: true,
      accessibilityScore: 100,
      topFaceDownRatio: 0,
      undercutRatio: 0,
      baseFlatRatio: 1, // Nuevo campo
      samples: 1000,
      details: "ratio=1.00 undercuts=0.00% baseOk=100.00% topDown=0.00%",
    },
    confidence: 100,
    details: "ratio=1.00 undercuts=0.00% baseOk=100.00% topDown=0.00%",
  }

  it("muestra el estado de 'Calculando...' cuando isAnalyzing es true", () => {
    render(
      <AnalysisBlock
        isAnalyzing={true}
        analysis={null}
        isDebugMode={false}
      />,
    )

    // Texto actualizado
    expect(screen.getByText("Calculando geometría...")).toBeInTheDocument()
    expect(
      screen.getByText("Verificando viabilidad para 3 ejes (buscando undercuts)..."),
    ).toBeInTheDocument()
  })

  it("no renderiza nada cuando no hay análisis y no está analizando", () => {
    const { container } = render(
      <AnalysisBlock
        isAnalyzing={false}
        analysis={null}
        isDebugMode={false}
      />,
    )

    // No debería aparecer el título principal
    expect(
      screen.queryByText("Reporte de Viabilidad"),
    ).not.toBeInTheDocument()

    // El contenedor raíz queda vacío
    expect(container.firstChild).toBeNull()
  })

  it("muestra el mensaje de éxito cuando el modelo es fabricable", () => {
    render(
      <AnalysisBlock
        isAnalyzing={false}
        analysis={baseAnalysis as any}
        isDebugMode={false}
      />,
    )

    // Título principal actualizado
    expect(
      screen.getByText("Reporte de Viabilidad"),
    ).toBeInTheDocument()

    // Badges actualizados
    expect(screen.getByText("Convexo")).toBeInTheDocument()
    // Nota: El badge ahora es parte de una tarjeta, buscamos el texto
    expect(screen.getByText("Fabricable")).toBeInTheDocument()

    // Mensaje principal actualizado
    expect(
      screen.getByText(/Modelo compatible para mecanizado CNC/i),
    ).toBeInTheDocument()

    // Métricas clave actualizadas
    expect(screen.getByText("Índice de Convexidad")).toBeInTheDocument()
    expect(screen.getByText("Zonas Inalcanzables (Undercuts)")).toBeInTheDocument()
    expect(screen.getByText("Estabilidad de Base")).toBeInTheDocument()
  })

  it("solo muestra el panel de depuración cuando isDebugMode es true", () => {
    // 1) Sin debug
    const { rerender } = render(
      <AnalysisBlock
        isAnalyzing={false}
        analysis={baseAnalysis as any}
        isDebugMode={false}
      />,
    )

    expect(
      screen.queryByText(/Ver datos crudos JSON/i),
    ).not.toBeInTheDocument()

    // 2) Con debug activado
    rerender(
      <AnalysisBlock
        isAnalyzing={false}
        analysis={baseAnalysis as any}
        isDebugMode={true}
      />,
    )

    // Texto del botón summary actualizado
    expect(
      screen.getByText(/Ver datos crudos JSON/i),
    ).toBeInTheDocument()

    // Verificamos que el JSON esté en el documento
    expect(
      screen.getByText(/"isThreeAxisMachable": true/i),
    ).toBeInTheDocument()
  })
})