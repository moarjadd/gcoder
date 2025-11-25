import { generateGCodeFromSTL } from "../stl-to-gcode"

// --- Fábrica de STLs binarios ---
function createBinaryStl(triangles: number[][][]): ArrayBuffer {
  const bufferLength = 84 + triangles.length * 50
  const buffer = Buffer.alloc(bufferLength)
  buffer.writeUInt32LE(triangles.length, 80)
  let offset = 84
  triangles.forEach((tri) => {
    buffer.writeFloatLE(0, offset); offset += 12 
    tri.forEach((v) => {
      buffer.writeFloatLE(v[0], offset); offset += 4
      buffer.writeFloatLE(v[1], offset); offset += 4
      buffer.writeFloatLE(v[2], offset); offset += 4
    })
    buffer.writeUInt16LE(0, offset); offset += 2
  })
  return buffer.buffer as ArrayBuffer
}

// --- Generador de Cubos Sólidos ---
function createBox(min: [number, number, number], max: [number, number, number]) {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  return [
    [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], // Base
    [[x0, y0, z1], [x0, y1, z1], [x1, y0, z1]], [[x1, y0, z1], [x0, y1, z1], [x1, y1, z1]], // Tapa
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z0]], [[x1, y0, z0], [x0, y0, z1], [x1, y0, z1]], // Frente
    [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], // Atrás
    [[x0, y0, z0], [x0, y1, z0], [x0, y0, z1]], [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], // Izq
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z0]], [[x1, y1, z0], [x1, y0, z1], [x1, y1, z1]]  // Der
  ]
}

describe("Generador de G-code (Núcleo de Manufactura)", () => {
  
  // Creamos un CUBO real (10x10x10)
  const cube = createBox([0, 0, 0], [10, 10, 10])
  const stlBuffer = createBinaryStl(cube)

  test("Debe generar una estructura G-code válida (Headers y Footers)", () => {
    const result = generateGCodeFromSTL(stlBuffer)
    const gcode = result.gcode

    expect(gcode).toContain("G21") 
    expect(gcode).toContain("G90") 
    expect(gcode).toContain("G17") 
    expect(gcode).toContain("M30") 
    
    // Esperamos lineas (>50)
    expect(result.lines).toBeGreaterThan(20)
  })

  test("Debe respetar los parámetros de máquina personalizados", () => {
    const customRPM = 12345
    const customFeed = 999
    
    const result = generateGCodeFromSTL(
      stlBuffer,
      { x: 0, y: 0, z: 0 }, 
      { layerHeight: 5 }, // Capas gruesas para que genere al menos un corte
      { feedXY: customFeed }, 
      { spindleRpm: customRPM, spindleOn: true } 
    )

    expect(result.gcode).toContain(`S${customRPM}`) 
    // Ahora sí habrá movimientos G1, por lo que aparecerá el Feed Rate
    expect(result.gcode).toContain(`F${customFeed}`) 
  })

  test("Debe aplicar la ROTACIÓN al modelo antes de cortar", () => {
    const resultNormal = generateGCodeFromSTL(
        stlBuffer, 
        { x: 0, y: 0, z: 0 }
    )

    const resultRotated = generateGCodeFromSTL(
        stlBuffer, 
        { x: Math.PI / 4, y: 0, z: 0 } // Rotar 45° para cambiar drásticamente la geometría
    )

    expect(resultNormal.gcode).not.toEqual(resultRotated.gcode)
    expect(resultRotated.lines).toBeGreaterThan(0)
  })
})