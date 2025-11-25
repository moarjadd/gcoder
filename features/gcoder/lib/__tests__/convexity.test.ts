import analyzeConvexity from "../convexity"

function createBinaryStl(triangles: number[][][]): Buffer {
  const bufferLength = 84 + triangles.length * 50
  const buffer = Buffer.alloc(bufferLength)
  buffer.writeUInt32LE(triangles.length, 80)
  let offset = 84
  triangles.forEach((tri) => {
    buffer.writeFloatLE(0, offset); offset += 4; buffer.writeFloatLE(0, offset); offset += 4; buffer.writeFloatLE(0, offset); offset += 4 // Normal
    tri.forEach((v) => {
      buffer.writeFloatLE(v[0], offset); offset += 4
      buffer.writeFloatLE(v[1], offset); offset += 4
      buffer.writeFloatLE(v[2], offset); offset += 4
    })
    buffer.writeUInt16LE(0, offset); offset += 2
  })
  return buffer
}

// --- Generador de Cubos Sólidos ---
// Crea los 12 triángulos necesarios para formar una caja cerrada
function createBox(min: [number, number, number], max: [number, number, number]) {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  
  // Definición de las 6 caras
  return [
    // Base (Z-)
    [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    // Tapa (Z+)
    [[x0, y0, z1], [x0, y1, z1], [x1, y0, z1]], [[x1, y0, z1], [x0, y1, z1], [x1, y1, z1]],
    // Frente (Y-)
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z0]], [[x1, y0, z0], [x0, y0, z1], [x1, y0, z1]],
    // Atrás (Y+)
    [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    // Izquierda (X-)
    [[x0, y0, z0], [x0, y1, z0], [x0, y0, z1]], [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
    // Derecha (X+)
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z0]], [[x1, y1, z0], [x1, y0, z1], [x1, y1, z1]]
  ]
}

describe("Algoritmo de Convexidad y Maquinabilidad (Lógica Crítica)", () => {
  
  test("Debe APROBAR una placa sólida en el suelo (Base Perfecta)", () => {
    // Una caja plana sólida en el suelo
    const box = createBox([0, 0, 0], [20, 20, 2]) 
    const stl = createBinaryStl(box)
    
    const result = analyzeConvexity(stl)

    expect(result.machinability.isThreeAxisMachable).toBe(true)
    expect(result.machinability.undercutRatio).toBeLessThan(0.01)
    expect(result.machinability.baseFlatRatio).toBeGreaterThan(0.9)
  })

  test("Debe RECHAZAR una geometría con 'Cueva' (Undercut Crítico)", () => {
    // Simulamos un undercut poniendo DOS cajas una encima de otra con un hueco en medio.
    // Caja 1: Suelo (0 a 2 de altura)
    // Caja 2: Techo flotante (10 a 12 de altura) alineado verticalmente.
    // El espacio entre Z=2 y Z=10 es aire encerrado verticalmente -> UNDERCUT.
    
    const base = createBox([0, 0, 0], [20, 20, 2])
    const roof = createBox([0, 0, 10], [20, 20, 12])
    
    const stl = createBinaryStl([...base, ...roof])
    const result = analyzeConvexity(stl)

    // Esto debe fallar porque un rayo vertical atraviesa: Techo -> Aire -> Base
    // Eso es la definición matemática de un undercut en 3 ejes.
    expect(result.machinability.isThreeAxisMachable).toBe(false)
    
    // Debe detectar undercuts
    expect(result.machinability.undercutRatio).toBeGreaterThan(0)
  })

  test("Debe ACEPTAR un cubo sólido simple (Convexo y Maquinable)", () => {
    // Un cubo perfecto de 10x10x10
    const cube = createBox([0, 0, 0], [10, 10, 10])
    
    const stl = createBinaryStl(cube)
    const result = analyzeConvexity(stl)

    // Al ser un sólido real, ahora sí puede calcular el volumen y convexidad
    expect(result.isConvex).toBe(true)
    expect(result.machinability.isThreeAxisMachable).toBe(true)
  })
})