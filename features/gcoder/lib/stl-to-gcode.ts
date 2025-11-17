// STL to G-code Converter (Browser-compatible TypeScript version) - con snap a la cama

export interface SlicingParams {
  layerHeight: number // Height between layers (mm)
  contourTol: number // Contour precision (distancia para unir segmentos)
  zigzag: boolean // Alternate direction per layer
  closeLoops: boolean // Close each contour
  topDown?: boolean // true => Zmax -> Zmin (router style)
}

export interface MachineParams {
  zSafe: number // Safety height (mm)
  leadIn: number // Pre-contact displacement along XY at cut Z (mm)
  feedXY: number // XY speed (mm/min)
  feedZ: number // Z speed (mm/min)
  xyMargin?: number // Margen (mm) desde el origen (0,0)

  // --- NUEVO: control de cama ---
  zBed?: number        // Plano de cama (por defecto 0)
  zGap?: number        // Separación mínima respecto a la cama (mm). 0 => toca la cama
  snapBottomToBed?: boolean // True => sube el modelo para que minZ >= zBed + zGap
}

export interface GCodeParams {
  unitsMm: boolean // G21 (mm) or G20 (inches)
  absolute: boolean // G90 absolute / G91 incremental
  spindleOn: boolean // Turn on spindle (M3 Sxxxx)
  spindleRpm: number // RPM if spindleOn=true
  zSafe: number // Safety height
  programName: string
  commentPrefix: string // Comment prefix
  precision: number // Decimals for XYZ and feed
}

export type ModelRotation = { x: number; y: number; z: number } // en radianes

// -------------------------------------------------
// Tipos internos
// -------------------------------------------------
interface Vector3 { x: number; y: number; z: number }
interface Triangle { v1: Vector3; v2: Vector3; v3: Vector3; normal: Vector3 }
interface Move { type: "G0" | "G1"; x?: number; y?: number; z?: number; feed?: number }
interface Polyline { points: Vector3[] }
interface Layer { z: number; polylines: Polyline[] }

// -------------------------------------------------
// STL parser (binario)
// -------------------------------------------------
function parseSTL(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer)
  const triangles: Triangle[] = []
  const numTriangles = view.getUint32(80, true)
  let offset = 84
  for (let i = 0; i < numTriangles; i++) {
    const normal: Vector3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    offset += 12
    const v1: Vector3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    offset += 12
    const v2: Vector3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    offset += 12
    const v3: Vector3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    offset += 12
    offset += 2 // attribute byte count
    triangles.push({ v1, v2, v3, normal })
  }
  return triangles
}

// -------------------------------------------------
// Rotación Euler XYZ (aplicada a vértices y normales)
// -------------------------------------------------
function rotateVertex(v: Vector3, rotation: ModelRotation): Vector3 {
  const { x: rx, y: ry, z: rz } = rotation
  const p = { ...v }

  // X
  let cos = Math.cos(rx), sin = Math.sin(rx)
  let y = p.y * cos - p.z * sin
  let z = p.y * sin + p.z * cos
  p.y = y; p.z = z

  // Y
  cos = Math.cos(ry); sin = Math.sin(ry)
  let x = p.x * cos + p.z * sin
  z = -p.x * sin + p.z * cos
  p.x = x; p.z = z

  // Z
  cos = Math.cos(rz); sin = Math.sin(rz)
  x = p.x * cos - p.y * sin
  y = p.x * sin + p.y * cos
  p.x = x; p.y = y

  return p
}

function applyRotation(triangles: Triangle[], rotation: ModelRotation): Triangle[] {
  if (!rotation || (rotation.x === 0 && rotation.y === 0 && rotation.z === 0)) return triangles
  return triangles.map((tri) => ({
    v1: rotateVertex(tri.v1, rotation),
    v2: rotateVertex(tri.v2, rotation),
    v3: rotateVertex(tri.v3, rotation),
    normal: rotateVertex(tri.normal, rotation),
  }))
}

// -------------------------------------------------
// Utilidades de malla
// -------------------------------------------------
function getMeshBounds(triangles: Triangle[]): { min: Vector3; max: Vector3 } {
  const min: Vector3 = { x: +Infinity, y: +Infinity, z: +Infinity }
  const max: Vector3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const tri of triangles) {
    for (const v of [tri.v1, tri.v2, tri.v3]) {
      min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z)
      max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z)
    }
  }
  return { min, max }
}

function computeLayers(zMin: number, zMax: number, layerHeight: number, topDown: boolean): number[] {
  const n = Math.max(1, Math.ceil((zMax - zMin) / layerHeight))
  const layers: number[] = []
  for (let i = 0; i <= n; i++) layers.push(zMin + i * layerHeight)
  return topDown ? layers.reverse() : layers
}

// Intersección triángulo/plano Z = z
function intersectTriangleWithPlane(tri: Triangle, z: number): Vector3[] {
  const points: Vector3[] = []
  const vertices = [tri.v1, tri.v2, tri.v3]
  for (let i = 0; i < 3; i++) {
    const v1 = vertices[i]
    const v2 = vertices[(i + 1) % 3]
    if ((v1.z <= z && v2.z >= z) || (v1.z >= z && v2.z <= z)) {
      if (Math.abs(v2.z - v1.z) < 1e-10) continue
      const t = (z - v1.z) / (v2.z - v1.z)
      const x = v1.x + t * (v2.x - v1.x)
      const y = v1.y + t * (v2.y - v1.y)
      points.push({ x, y, z })
    }
  }
  return points
}

// Reconstruye polilíneas en un nivel Z
function sliceAtZ(triangles: Triangle[], z: number, tolerance: number): Polyline[] {
  const segments: Array<[Vector3, Vector3]> = []
  for (const tri of triangles) {
    const pts = intersectTriangleWithPlane(tri, z)
    if (pts.length === 2) segments.push([pts[0], pts[1]])
  }
  if (segments.length === 0) return []

  const polylines: Polyline[] = []
  const used = new Set<number>()

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    const poly: Vector3[] = [segments[i][0], segments[i][1]]
    used.add(i)

    let extended = true
    while (extended) {
      extended = false
      const last = poly[poly.length - 1]
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const [p1, p2] = segments[j]
        const d1 = Math.hypot(last.x - p1.x, last.y - p1.y)
        const d2 = Math.hypot(last.x - p2.x, last.y - p2.y)
        if (d1 < tolerance) {
          poly.push(p2); used.add(j); extended = true; break
        } else if (d2 < tolerance) {
          poly.push(p1); used.add(j); extended = true; break
        }
      }
    }
    polylines.push({ points: poly })
  }
  return polylines
}

function sliceMesh(triangles: Triangle[], params: SlicingParams): Layer[] {
  const bounds = getMeshBounds(triangles)
  const zs = computeLayers(bounds.min.z, bounds.max.z, params.layerHeight, params.topDown ?? true)
  const layers: Layer[] = []
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]
    let polylines = sliceAtZ(triangles, z, params.contourTol)
    if (params.closeLoops) {
      polylines = polylines.map((poly) => {
        const points = [...poly.points]
        if (points.length >= 2) {
          const first = points[0]
          const last = points[points.length - 1]
          const dist = Math.hypot(first.x - last.x, first.y - last.y)
          if (dist > 1e-6) points.push({ ...first })
        }
        return { points }
      })
    }
    if (params.zigzag && i % 2 === 1) polylines = polylines.map((p) => ({ points: [...p.points].reverse() }))
    if (polylines.length > 0) layers.push({ z, polylines })
  }
  return layers
}

// -------------------------------------------------
// Trayectorias -> G-code
// -------------------------------------------------
function buildMoves(layers: Layer[], params: MachineParams): Move[] {
  const moves: Move[] = []
  const zSafe = params.zSafe
  for (const layer of layers) {
    for (const poly of layer.polylines) {
      if (poly.points.length === 0) continue
      const start = poly.points[0]

      // Aproximación y descenso al Z de corte
      moves.push({ type: "G0", x: start.x, y: start.y, z: zSafe })
      moves.push({ type: "G1", x: start.x, y: start.y, z: layer.z, feed: params.feedZ })

      // Lead-in
      if (params.leadIn > 0 && poly.points.length > 1) {
        const p2 = poly.points[1]
        const dx = p2.x - start.x
        const dy = p2.y - start.y
        const len = Math.hypot(dx, dy) || 1
        const li = Math.min(params.leadIn, len * 0.5)
        const liX = start.x + (dx / len) * li
        const liY = start.y + (dy / len) * li
        moves.push({ type: "G1", x: liX, y: liY, z: layer.z, feed: params.feedXY })
      }

      // Corte del contorno
      for (let i = 1; i < poly.points.length; i++) {
        const pt = poly.points[i]
        moves.push({ type: "G1", x: pt.x, y: pt.y, z: layer.z, feed: params.feedXY })
      }

      // Retiro seguro
      const end = poly.points[poly.points.length - 1]
      moves.push({ type: "G0", x: end.x, y: end.y, z: zSafe })
    }
  }
  return moves
}

function fmtNum(x: number, precision: number): string {
  const s = x.toFixed(precision)
  return s.startsWith("-0.") && Math.abs(x) < 0.5 * Math.pow(10, -precision) ? "0" + s.slice(1) : s
}

function generateGCode(moves: Move[], params: GCodeParams): string[] {
  const lines: string[] = []
  lines.push(`${params.commentPrefix}Program: ${params.programName}`)
  lines.push(`${params.commentPrefix}Generated by G-coder`)
  lines.push(params.unitsMm ? "G21" : "G20")
  lines.push(params.absolute ? "G90" : "G91")
  lines.push("G17")
  lines.push(`G0 Z${fmtNum(params.zSafe, params.precision)}`)
  if (params.spindleOn) lines.push(`M3 S${params.spindleRpm}`)

  let currentMode: string | null = null
  let currentFeed: number | null = null

  for (const move of moves) {
    const tokens: string[] = []
    if (move.type !== currentMode) { tokens.push(move.type); currentMode = move.type }
    if (move.x !== undefined) tokens.push(`X${fmtNum(move.x, params.precision)}`)
    if (move.y !== undefined) tokens.push(`Y${fmtNum(move.y, params.precision)}`)
    if (move.z !== undefined) tokens.push(`Z${fmtNum(move.z, params.precision)}`)
    if (move.type === "G1" && move.feed !== undefined) {
      if (currentFeed === null || Math.abs(move.feed - currentFeed) > 1e-9) {
        tokens.push(`F${fmtNum(move.feed, 0)}`)
        currentFeed = move.feed
      }
    }
    if (tokens.length > 0) lines.push(tokens.join(" "))
  }

  lines.push(`G0 Z${fmtNum(params.zSafe, params.precision)}`)
  if (params.spindleOn) lines.push("M5")
  lines.push("M30")
  return lines
}

// -------------------------------------------------
// API principal
// -------------------------------------------------
export function generateGCodeFromSTL(
  buffer: ArrayBuffer,
  rotation: ModelRotation = { x: 0, y: 0, z: 0 },
  slicingParams: Partial<SlicingParams> = {},
  machineParams: Partial<MachineParams> = {},
  gcodeParams: Partial<GCodeParams> = {},
): { gcode: string; lines: number; layers: number } {
  // Slicing defaults
  const sp: SlicingParams = {
    layerHeight: 0.5,
    contourTol: 0.01,
    zigzag: true,
    closeLoops: true,
    topDown: true,
    ...slicingParams,
  }

  // Machine defaults (incluye cama)
  const mp: MachineParams = {
    zSafe: 5.0,
    leadIn: 0.5,
    feedXY: 600.0,
    feedZ: 300.0,
    xyMargin: 1.0,
    zBed: 0,
    zGap: 0,              // p.ej. 0.1 si quieres despegar 0.1 mm de la cama
    snapBottomToBed: true,
    ...machineParams,
  }

  // G-code defaults
  const gcp: GCodeParams = {
    unitsMm: true,
    absolute: true,
    spindleOn: true,
    spindleRpm: 1000,
    zSafe: 5.0,
    programName: "STL_WATERLINE",
    commentPrefix: "; ",
    precision: 3,
    ...gcodeParams,
  }

  // --- Parse + (opcional) rotación centrada ---
  let triangles = parseSTL(buffer)

  if (rotation && (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0)) {
    const bounds = getMeshBounds(triangles)
    const cx = (bounds.min.x + bounds.max.x) / 2
    const cy = (bounds.min.y + bounds.max.y) / 2
    const cz = (bounds.min.z + bounds.max.z) / 2
    const centered = triangles.map((t) => ({
      v1: { x: t.v1.x - cx, y: t.v1.y - cy, z: t.v1.z - cz },
      v2: { x: t.v2.x - cx, y: t.v2.y - cy, z: t.v2.z - cz },
      v3: { x: t.v3.x - cx, y: t.v3.y - cy, z: t.v3.z - cz },
      normal: t.normal,
    }))
    triangles = applyRotation(centered, rotation)
  }

  // --- Bounds tras rotación ---
  const finalBounds = getMeshBounds(triangles)

  // XY: trasladar al cuadrante positivo con margen
  const margin = mp.xyMargin ?? 0
  const translateX = -finalBounds.min.x + margin
  const translateY = -finalBounds.min.y + margin

  // Z: levantar para que la base no atraviese la cama
  const zBed = mp.zBed ?? 0
  const zGap = mp.zGap ?? 0
  const zLift = (mp.snapBottomToBed ?? true)
    ? Math.max(0, (zBed + zGap) - finalBounds.min.z)
    : 0

  // Slicing y trayectorias (en coords originales)
  const layers = sliceMesh(triangles, sp)
  const moves = buildMoves(layers, mp)

  // Traslación final de todas las trayectorias (incluye Z)
  const translatedMoves = moves.map((move) => ({
    ...move,
    x: move.x !== undefined ? move.x + translateX : undefined,
    y: move.y !== undefined ? move.y + translateY : undefined,
    z: move.z !== undefined ? move.z + zLift : undefined,
  }))

  // Ajustar zSafe global en el header también
  const gcpWithLift: GCodeParams = { ...gcp, zSafe: gcp.zSafe + zLift }

  const gcodeLines = generateGCode(translatedMoves, gcpWithLift)

  return {
    gcode: gcodeLines.join("\n"),
    lines: gcodeLines.length,
    layers: layers.length,
  }
}
