// convexivity.ts — FP‑robust v3.3 (Critical Fix: Global Z Undercut Check)

import convexHull from "convex-hull"
import { Buffer } from "buffer"

// ───────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ───────────────────────────────────────────────────────────────────────────────
export type ModelRotation = { x: number; y: number; z: number }

export interface MachinabilityResult {
  isThreeAxisMachable: boolean
  accessibilityScore: number // 0–100
  topFaceDownRatio: number // 0..1
  undercutRatio: number // 0..1
  overhangRatio: number // 0..1
  baseFlatRatio: number // 0..1
  samples: number
  details: string
  failureReason?: string // Razón explícita del error fatal (Undercuts)
  warnings?: string[]    // NUEVO: Advertencias no fatales (Base inestable, etc)
}

export interface ConvexityAnalysis {
  isConvex: boolean
  meshVolume: number
  hullVolume: number
  convexityRatio: number // clamped 0..1
  confidence: number // 0..100
  machinability: MachinabilityResult
  error?: string 
  details?: string
}

export interface ConvexityOptions {
  tolerance?: number // Default 0.99
  badGap?: number 
  eps?: number 
  // Fabricabilidad
  grid?: number // Default 128
  maxUpAngleDeg?: number 
  zEps?: number 
}

// ───────────────────────────────────────────────────────────────────────────────
// SHIM Buffer (browser)
// ───────────────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined" && !(globalThis as any).Buffer) {
  ;(globalThis as any).Buffer = Buffer
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilidades numéricas / geométricas
// ───────────────────────────────────────────────────────────────────────────────

type Vec3 = [number, number, number]
type Tri = [number, number, number, number, number, number, number, number, number]

function toNodeBuffer(input: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input)
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input))
  throw new Error(`Tipo de entrada no válido: ${typeof input}`)
}

function isFiniteVec3(v: number[]): v is number[] { return v.length === 3 && v.every(Number.isFinite) }

function bbox(points: number[][]) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (const p of points) {
    if (!isFiniteVec3(p)) continue
    const [x, y, z] = p
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
  }
  const dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2]
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return { min, max, dx, dy, dz, diag }
}

function isThinBBox(b: { dx: number; dy: number; dz: number }, lenEps: number) {
  return ((b.dx < lenEps ? 1 : 0) + (b.dy < lenEps ? 1 : 0) + (b.dz < lenEps ? 1 : 0)) >= 1
}

function confidenceFromRatio(ratio: number, badGap = 0.05): number {
  const gap = Math.max(0, 1 - ratio)
  if (!Number.isFinite(ratio)) return 0
  if (badGap <= 0) return ratio >= 1 ? 100 : 0
  const c = Math.round(100 * Math.max(0, 1 - gap / badGap))
  return Math.min(100, Math.max(0, c))
}

function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x }

function toRadiansMaybe(rot: ModelRotation): ModelRotation {
  const m = Math.max(Math.abs(rot.x), Math.abs(rot.y), Math.abs(rot.z))
  if (m > Math.PI * 2 + 1e-6) {
    const d2r = Math.PI / 180
    return { x: rot.x * d2r, y: rot.y * d2r, z: rot.z * d2r }
  }
  return rot
}

export function applyRotation(positions: number[][], rotation: ModelRotation): number[][] {
  const sinX = Math.sin(rotation.x), cosX = Math.cos(rotation.x)
  const sinY = Math.sin(rotation.y), cosY = Math.cos(rotation.y)
  const sinZ = Math.sin(rotation.z), cosZ = Math.cos(rotation.z)
  const out: number[][] = []
  for (const p of positions) {
    const [x, y, z] = p
    const y1 = y * cosX - z * sinX
    const z1 = y * sinX + z * cosX
    const x2 = x * cosY + z1 * sinY
    const z2 = -x * sinY + z1 * cosY
    const x3 = x2 * cosZ - y1 * sinZ
    const y3 = x2 * sinZ + y1 * cosZ
    out.push([x3, y3, z2])
  }
  return out
}

function meshVolume(cells: number[][], positions: number[][]): number {
  let V = 0
  for (const c of cells) {
    if (c.length !== 3) continue
    const v0 = positions[c[0]], v1 = positions[c[1]], v2 = positions[c[2]]
    if (!v0 || !v1 || !v2) continue
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    const dot = v0[0] * cx + v0[1] * cy + v0[2] * cz
    V += dot
  }
  return V / 6
}

// ───────────────────────────────────────────────────────────────────────────────
// Parser STL
// ───────────────────────────────────────────────────────────────────────────────

function parseBinarySTL(buf: Buffer): Tri[] {
  if (buf.length < 84) throw new Error("STL binario demasiado corto.")
  const triCount = buf.readUInt32LE(80)
  const need = 84 + triCount * 50
  if (buf.length < need) throw new Error("STL binario truncado.")
  const tris: Tri[] = []
  let off = 84
  for (let i = 0; i < triCount; i++) {
    const v1x = buf.readFloatLE(off + 12), v1y = buf.readFloatLE(off + 16), v1z = buf.readFloatLE(off + 20)
    const v2x = buf.readFloatLE(off + 24), v2y = buf.readFloatLE(off + 28), v2z = buf.readFloatLE(off + 32)
    const v3x = buf.readFloatLE(off + 36), v3y = buf.readFloatLE(off + 40), v3z = buf.readFloatLE(off + 44)
    tris.push([v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z])
    off += 50
  }
  return tris
}

function parseAsciiSTL(str: string): Tri[] {
  const verts: number[] = []
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) {
    verts.push(Number.parseFloat(m[1]), Number.parseFloat(m[2]), Number.parseFloat(m[3]))
  }
  if (verts.length % 9 !== 0) throw new Error("STL ASCII malformado (vértices no múltiplo de 9).")
  const tris: Tri[] = []
  for (let i = 0; i < verts.length; i += 9) {
    tris.push([verts[i], verts[i + 1], verts[i + 2], verts[i + 3], verts[i + 4], verts[i + 5], verts[i + 6], verts[i + 7], verts[i + 8]])
  }
  return tris
}

function parseSTL(input: ArrayBuffer | Uint8Array | Buffer): { positions: number[][]; cells: number[][] } {
  const buf = toNodeBuffer(input)
  const head = buf.slice(0, 80).toString("utf8")
  let tris: Tri[]
  if (/^solid/i.test(head) && buf.toString("utf8").includes("facet")) {
    tris = parseAsciiSTL(buf.toString("utf8"))
  } else {
    tris = parseBinarySTL(buf)
  }
  const positions: number[][] = []
  const cells: number[][] = []
  for (const t of tris) {
    const i0 = positions.push([t[0], t[1], t[2]]) - 1
    const i1 = positions.push([t[3], t[4], t[5]]) - 1
    const i2 = positions.push([t[6], t[7], t[8]]) - 1
    cells.push([i0, i1, i2])
  }
  return { positions, cells }
}

// ───────────────────────────────────────────────────────────────────────────────
// Saneado mínimo
// ───────────────────────────────────────────────────────────────────────────────

function sanitizeMesh(positionsIn: number[][], cellsIn: number[][]) {
  const keepV = new Array(positionsIn.length).fill(false)
  const cellsOut: number[][] = []
  for (const c of cellsIn) {
    if (c.length !== 3) continue
    const a = positionsIn[c[0]], b = positionsIn[c[1]], d = positionsIn[c[2]]
    if (!isFiniteVec3(a) || !isFiniteVec3(b) || !isFiniteVec3(d)) continue
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    const dblArea = Math.sqrt(cx * cx + cy * cy + cz * cz)
    if (!(dblArea > 1e-12)) continue 
    cellsOut.push(c)
    keepV[c[0]] = keepV[c[1]] = keepV[c[2]] = true
  }
  const idx = new Map<number, number>()
  const posOut: number[][] = []
  for (let i = 0; i < positionsIn.length; i++) {
    if (keepV[i]) { idx.set(i, posOut.length); posOut.push(positionsIn[i]) }
  }
  const rem = cellsOut.map(([i, j, k]) => [idx.get(i)!, idx.get(j)!, idx.get(k)!])
  return { positions: posOut, cells: rem }
}

// ───────────────────────────────────────────────────────────────────────────────
// WELD & UTILS
// ───────────────────────────────────────────────────────────────────────────────

function weldMesh(positions: number[][], cells: number[][], eps: number) {
  const k = 1 / Math.max(eps, 1e-12)
  const key = (p: number[]) => `${Math.round(p[0]*k)}|${Math.round(p[1]*k)}|${Math.round(p[2]*k)}`
  const map = new Map<string, number>()
  const posOut: number[][] = []
  const remap = new Array<number>(positions.length)

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const K = key(p)
    let idx = map.get(K)
    if (idx === undefined) { idx = posOut.length; map.set(K, idx); posOut.push(p) }
    remap[i] = idx
  }

  const cellsOut: number[][] = []
  for (const [a,b,c] of cells) {
    const i = remap[a], j = remap[b], k2 = remap[c]
    if (i === j || j === k2 || i === k2) continue
    cellsOut.push([i,j,k2])
  }
  return { positions: posOut, cells: cellsOut }
}

function centroid(positions: number[][]): Vec3 {
  let x = 0, y = 0, z = 0
  const n = positions.length || 1
  for (const p of positions) { x += p[0]; y += p[1]; z += p[2] }
  return [x / n, y / n, z / n]
}

function triNormal(p0: Vec3, p1: Vec3, p2: Vec3): Vec3 {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2]
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

function orientFacesOutward(positions: number[][], cells: number[][]) {
  const c = centroid(positions)
  const outCells: number[][] = []
  for (const [i, j, k] of cells) {
    const p0 = positions[i] as Vec3, p1 = positions[j] as Vec3, p2 = positions[k] as Vec3
    const n = triNormal(p0, p1, p2)
    const ct: Vec3 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3]
    const v: Vec3 = [ct[0] - c[0], ct[1] - c[1], ct[2] - c[2]]
    const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2]
    outCells.push(dot >= 0 ? [i, j, k] : [i, k, j])
  }
  return outCells
}

// ───────────────────────────────────────────────────────────────────────────────
// Métricas avanzadas
// ───────────────────────────────────────────────────────────────────────────────

function buildEdgeStats(positions: number[][], cells: number[][]) {
  type Entry = { n1?: Vec3; n2?: Vec3; count: number; mid: Vec3 }
  const key = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const map = new Map<string, Entry>()
  const c = centroid(positions)

  for (const [i, j, k] of cells) {
    const p0 = positions[i] as Vec3, p1 = positions[j] as Vec3, p2 = positions[k] as Vec3
    const n = triNormal(p0, p1, p2)
    const edges: [number, number, Vec3, Vec3][] = [ [i, j, p0, p1], [j, k, p1, p2], [k, i, p2, p0] ]
    for (const [a, b, pa, pb] of edges) {
      const K = key(a, b)
      const mid: Vec3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]
      const e = map.get(K)
      if (!e) {
        map.set(K, { n1: n, count: 1, mid })
      } else {
        if (!e.n2) e.n2 = n
        e.count = Math.min(2, (e.count || 1) + 1)
      }
    }
  }

  const ANG_MIN = Math.cos((5 * Math.PI) / 180)
  let concave = 0, paired = 0, boundary = 0

  for (const e of map.values()) {
    if (e.count === 1) {
      boundary++
    } else if (e.n1 && e.n2) {
      paired++
      const n1 = e.n1, n2 = e.n2
      const dot = n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2]
      const ns: Vec3 = [n1[0]+n2[0], n1[1]+n2[1], n1[2]+n2[2]]
      const vc: Vec3 = [e.mid[0]-c[0], e.mid[1]-c[1], e.mid[2]-c[2]]
      const s = ns[0]*vc[0] + ns[1]*vc[1] + ns[2]*vc[2]
      if (dot < ANG_MIN && s < 0) concave++
    }
  }

  const concaveRatio = paired > 0 ? concave / paired : 1
  const boundaryRatio = (boundary) / (map.size || 1)
  const watertight = boundary === 0
  return { concaveRatio, boundaryRatio, watertight, edgeCount: map.size }
}

function triBoundsOnPlane(axis: 0 | 1 | 2, p0: Vec3, p1: Vec3, p2: Vec3) {
  if (axis === 2) {
    const minX = Math.min(p0[0], p1[0], p2[0])
    const maxX = Math.max(p0[0], p1[0], p2[0])
    const minY = Math.min(p0[1], p1[1], p2[1])
    const maxY = Math.max(p0[1], p1[1], p2[1])
    return { minA: minX, maxA: maxX, minB: minY, maxB: maxY }
  } else if (axis === 0) {
    const minY = Math.min(p0[1], p1[1], p2[1])
    const maxY = Math.max(p0[1], p1[1], p2[1])
    const minZ = Math.min(p0[2], p1[2], p2[2])
    const maxZ = Math.max(p0[2], p1[2], p2[2])
    return { minA: minY, maxA: maxY, minB: minZ, maxB: maxZ }
  } else {
    const minX = Math.min(p0[0], p1[0], p2[0])
    const maxX = Math.max(p0[0], p1[0], p2[0])
    const minZ = Math.min(p0[2], p1[2], p2[2])
    const maxZ = Math.max(p0[2], p1[2], p2[2])
    return { minA: minX, maxA: maxX, minB: minZ, maxB: maxZ }
  }
}

function rayAxisHit(axis: 0 | 1 | 2, a: number, b: number, p0: Vec3, p1: Vec3, p2: Vec3): number | null {
  if (axis === 2) {
    const x = a, y = b
    const x0 = p0[0], y0 = p0[1], z0 = p0[2]
    const x1 = p1[0], y1 = p1[1], z1 = p1[2]
    const x2 = p2[0], y2 = p2[1], z2 = p2[2]
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if (Math.abs(den) < 1e-18) return null
    const l1 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den
    const l2 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den
    const l3 = 1 - l1 - l2
    if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) return null
    return l1 * z0 + l2 * z1 + l3 * z2
  } else if (axis === 0) {
    const y = a, z = b
    const y0 = p0[1], z0 = p0[2], x0 = p0[0]
    const y1 = p1[1], z1 = p1[2], x1 = p1[0]
    const y2 = p2[1], z2 = p2[2], x2 = p2[0]
    const den = (z1 - z2) * (y0 - y2) + (y2 - y1) * (z0 - z2)
    if (Math.abs(den) < 1e-18) return null
    const l1 = ((z1 - z2) * (y - y2) + (y2 - y1) * (z - z2)) / den
    const l2 = ((z2 - z0) * (y - y2) + (y0 - y2) * (z - z2)) / den
    const l3 = 1 - l1 - l2
    if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) return null
    return l1 * x0 + l2 * x1 + l3 * x2
  } else {
    const x = a, z = b
    const x0 = p0[0], z0 = p0[2], y0 = p0[1]
    const x1 = p1[0], z1 = p1[2], y1 = p1[1]
    const x2 = p2[0], z2 = p2[2], y2 = p2[1]
    const den = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2)
    if (Math.abs(den) < 1e-18) return null
    const l1 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / den
    const l2 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / den
    const l3 = 1 - l1 - l2
    if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) return null
    return l1 * y0 + l2 * y1 + l3 * y2
  }
}

function multiAxisConcavityRatios(
  positions: number[][],
  cells: number[][],
  gridHint = 100,
) {
  const bb = bbox(positions)
  const grid = Math.max(32, Math.min(gridHint, 200)) 
  const results: Record<'Z'|'X'|'Y', number> = { Z: 0, X: 0, Y: 0 }
  const zEps = Math.max(1e-9, bb.diag * 1e-6)

  const axes: [0|1|2, 'X'|'Y'|'Z', number, number, number, number][] = [
    [2, 'Z', bb.min[0], bb.max[0], bb.min[1], bb.max[1]],
    [0, 'X', bb.min[1], bb.max[1], bb.min[2], bb.max[2]],
    [1, 'Y', bb.min[0], bb.max[0], bb.min[2], bb.max[2]],
  ]

  for (const [axis, key, minA, maxA, minB, maxB] of axes) {
    const nA = grid, nB = grid
    const sA = (maxA - minA) / (nA - 1 || 1)
    const sB = (maxB - minB) / (nB - 1 || 1)
    let samples = 0, multi = 0

    const tris: { p0: Vec3; p1: Vec3; p2: Vec3; bb: { minA: number; maxA: number; minB: number; maxB: number } }[] = []
    for (const c of cells as any as [number, number, number][]) {
      const p0 = positions[c[0]] as Vec3, p1 = positions[c[1]] as Vec3, p2 = positions[c[2]] as Vec3
      if (!p0 || !p1 || !p2) continue
      const bb2 = triBoundsOnPlane(axis, p0, p1, p2)
      if (!Number.isFinite(bb2.minA + bb2.maxA + bb2.minB + bb2.maxB)) continue
      tris.push({ p0, p1, p2, bb: bb2 })
    }
    if (!tris.length) { results[key] = 1; continue }

    for (let ib = 0; ib < nB; ib++) {
      const B = nB === 1 ? (minB + maxB) * 0.5 : minB + ib * sB
      for (let ia = 0; ia < nA; ia++) {
        const A = nA === 1 ? (minA + maxA) * 0.5 : minA + ia * sA
        samples++
        const hits: number[] = []
        for (const t of tris) {
          if (A < t.bb.minA || A > t.bb.maxA || B < t.bb.minB || B > t.bb.maxB) continue
          const z = rayAxisHit(axis, A, B, t.p0, t.p1, t.p2)
          if (z === null || !Number.isFinite(z)) continue
          hits.push(z)
        }
        if (!hits.length) continue
        hits.sort((a, b) => b - a)
        const groups: number[] = []
        for (const h of hits) if (!groups.length || Math.abs(groups[groups.length - 1] - h) > zEps) groups.push(h)
        if (groups.length > 2) multi++
      }
    }
    results[key] = samples ? multi / samples : 1
  }
  return results 
}

// ───────────────────────────────────────────────────────────────────────────────
// Heurística de FABRICABILIDAD (Z+)
// ───────────────────────────────────────────────────────────────────────────────

function triXYBounds(p0: Vec3, p1: Vec3, p2: Vec3) {
  const minX = Math.min(p0[0], p1[0], p2[0])
  const maxX = Math.max(p0[0], p1[0], p2[0])
  const minY = Math.min(p0[1], p1[1], p2[1])
  const maxY = Math.max(p0[1], p1[1], p2[1])
  return { minX, maxX, minY, maxY }
}

function rayZHit(x: number, y: number, p0: Vec3, p1: Vec3, p2: Vec3): number | null {
  const x0 = p0[0], y0 = p0[1], z0 = p0[2]
  const x1 = p1[0], y1 = p1[1], z1 = p1[2]
  const x2 = p2[0], y2 = p2[1], z2 = p2[2]
  const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
  if (Math.abs(den) < 1e-18) return null
  const l1 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den
  const l2 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den
  const l3 = 1 - l1 - l2
  if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) return null
  return l1 * z0 + l2 * z1 + l3 * z2
}

function computeMachinabilityFromMesh(
  positions: number[][],
  cells: number[][],
  opts: ConvexityOptions,
): MachinabilityResult {
  const grid = Math.max(32, Math.min(opts.grid ?? 128, 512))
  const maxUpAngleDeg = Math.max(0, Math.min(opts.maxUpAngleDeg ?? 89.9, 89.9))
  const cosMax = Math.cos((maxUpAngleDeg * Math.PI) / 180)

  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY

  for (const [x, y, z] of positions) {
    if (!Number.isFinite(x + y + z)) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  const diag = Math.hypot(dx, dy, dz) || 1
  const zEps = opts.zEps ?? Math.max(1e-9, diag * 1e-5)
  
  const basePlaneTol = Math.max(zEps * 4, diag * 2e-3) 

  const tris: { p0: Vec3; p1: Vec3; p2: Vec3; n: Vec3; bb: { minX: number; maxX: number; minY: number; maxY: number } }[] = []

  for (const c of cells as any as [number, number, number][]) {
    const p0 = positions[c[0]] as Vec3
    const p1 = positions[c[1]] as Vec3
    const p2 = positions[c[2]] as Vec3
    if (!p0 || !p1 || !p2) continue
    const n = triNormal(p0, p1, p2)
    const bb2 = triXYBounds(p0, p1, p2)
    if (!Number.isFinite(bb2.minX + bb2.maxX + bb2.minY + bb2.maxY)) continue
    tris.push({ p0, p1, p2, n, bb: bb2 })
  }

  if (!tris.length) {
    return { isThreeAxisMachable: false, accessibilityScore: 0, topFaceDownRatio: 1, undercutRatio: 1, overhangRatio: 1, baseFlatRatio: 0, samples: 0, details: "Sin triángulos válidos." }
  }

  const nx = grid, ny = grid
  const sx = dx / (nx - 1 || 1)
  const sy = dy / (ny - 1 || 1)
  
  let samples = 0, ok = 0, undercuts = 0, topFaceDown = 0, overhangs = 0
  const zLows: number[] = []

  // Raycasting loop
  for (let iy = 0; iy < ny; iy++) {
    const y = ny === 1 ? (minY + maxY) * 0.5 : minY + iy * sy
    for (let ix = 0; ix < nx; ix++) {
      const x = nx === 1 ? (minX + maxX) * 0.5 : minX + ix * sx
      
      const hits: { z: number; nz: number }[] = []
      for (const t of tris) {
        if (x < t.bb.minX || x > t.bb.maxX || y < t.bb.minY || y > t.bb.maxY) continue
        const z = rayZHit(x, y, t.p0, t.p1, t.p2)
        if (z === null || !Number.isFinite(z)) continue
        hits.push({ z, nz: t.n[2] })
      }

      if (!hits.length) continue
      
      samples++
      hits.sort((a, b) => b.z - a.z) // Top to Bottom
      
      const groups: { z: number; nz: number }[] = []
      for (const h of hits) {
        if (!groups.length || Math.abs(groups[groups.length - 1].z - h.z) > zEps) {
          groups.push(h)
        }
      }

      let nTopZ = groups[0].nz
      if (nTopZ < -0.95) nTopZ = 1.0 
      if (nTopZ < -cosMax) topFaceDown++

      const zLow = groups[groups.length - 1].z
      if (Number.isFinite(zLow)) zLows.push(zLow)

      let isUndercut = false
      let isOverhang = false

      if (groups.length > 2) {
        isUndercut = true
      } 
      
      // FIX: Comparar contra GLOBAL minZ para detectar geometrías curvas que se cierran "abajo"
      // (Ejemplo: Un cilindro horizontal o letra D vertical)
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]
        // Si la superficie mira hacia abajo y NO está en el piso global
        if (g.nz < -0.1) {
             if (g.z > minZ + basePlaneTol) {
                 isOverhang = true
             }
        }
      }
      
      if (isOverhang) undercuts++
      else if (isUndercut) undercuts++

      if (!isUndercut && !isOverhang && !(nTopZ < -cosMax)) ok++
    }
  }

  const undercutRatio = samples ? undercuts / samples : 0
  const topFaceDownRatio = samples ? topFaceDown / samples : 0
  const accessibilityScore = samples ? Math.round((ok / samples) * 100) : 0

  let baseOkRatio = 1
  if (zLows.length > 0) {
    const binK = 1 / Math.max(basePlaneTol, 1e-12)
    const bins = new Map<number, number>()
    let maxCount = 0
    for (const z of zLows) {
      const b = Math.round(z * binK)
      const c = (bins.get(b) || 0) + 1
      bins.set(b, c)
      if (c > maxCount) maxCount = c
    }
    baseOkRatio = maxCount / zLows.length
  }

  // FIX: Lógica CNC (Sustractiva)
  // 1. Undercuts y TopFaceDown son los errores críticos de geometría.
  // 2. BaseFlat es una ADVERTENCIA de setup (requiere tabs/stock), pero no impide el maquinado.
  
  const passUndercuts = undercutRatio <= 0.02
  const passTop = topFaceDownRatio <= 0.02
  const passAccess = accessibilityScore >= 95
  const passBase = baseOkRatio >= 0.85

  // Solo fallamos si la geometría es físicamente imposible de cortar desde arriba (undercuts)
  const isThreeAxisMachable = passUndercuts && passTop && passAccess

  const fails: string[] = []
  if (!passUndercuts) fails.push("Undercuts (Socavados/Panza)")
  if (!passTop) fails.push("Caras Invertidas")
  if (!passAccess) fails.push("Acceso bloqueado")

  const warnings: string[] = []
  if (!passBase) warnings.push("Base inestable (Requiere tabs/mordazas)")

  const failureReason = fails.length > 0 ? fails.join(", ") : undefined

  // Detalles informativos
  let detailsString = `grid=${grid}x${grid}, undercuts=${(undercutRatio * 100).toFixed(2)}%`
  if (failureReason) detailsString += ` [ERROR: ${failureReason}]`
  else if (warnings.length > 0) detailsString += ` [WARN: ${warnings[0]}]`
  else detailsString += ` [OK]`

  return {
    isThreeAxisMachable,
    accessibilityScore,
    topFaceDownRatio,
    undercutRatio,
    overhangRatio: undercutRatio, 
    baseFlatRatio: baseOkRatio,
    samples,
    details: detailsString,
    failureReason,
    warnings
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// API principal
// ───────────────────────────────────────────────────────────────────────────────

export function analyzeConvexity(
  stlInput: ArrayBuffer | Uint8Array | Buffer,
  options: ConvexityOptions = {},
  modelRotation?: ModelRotation,
): ConvexityAnalysis {
  const volTol = options.tolerance ?? 0.99
  const badGap = options.badGap ?? 0.05
  const baseEps = options.eps ?? 1e-6

  try {
    const parsed = parseSTL(stlInput)
    let positions = parsed.positions
    let cells = parsed.cells

    const beforeV = positions.length, beforeF = cells.length
    if (beforeV < 3 || beforeF < 1) throw new Error("STL sin triángulos válidos.")

    const san = sanitizeMesh(positions, cells)
    positions = san.positions
    cells = san.cells

    if (modelRotation && (modelRotation.x || modelRotation.y || modelRotation.z)) {
      const rot = toRadiansMaybe(modelRotation)
      const bbOriginal = bbox(positions)
      const cx = (bbOriginal.min[0] + bbOriginal.max[0]) / 2
      const cy = (bbOriginal.min[1] + bbOriginal.max[1]) / 2
      const cz = (bbOriginal.min[2] + bbOriginal.max[2]) / 2
      const centered = positions.map(p => [p[0] - cx, p[1] - cy, p[2] - cz])
      positions = applyRotation(centered, rot)
    }

    const bb0 = bbox(positions)
    const weldEps = Math.max(baseEps * Math.max(bb0.diag, 1), 1e-9)
    const welded = weldMesh(positions, cells, weldEps)
    positions = welded.positions
    cells = welded.cells

    const bb = bbox(positions)
    const lenEps = Math.max(baseEps * Math.max(bb.diag, 1), 1e-9)
    if (isThinBBox(bb, lenEps)) {
      const mach2D = computeMachinabilityFromMesh(positions, cells, options)
      return { isConvex: false, meshVolume: 0, hullVolume: 0, convexityRatio: 0, confidence: 0, machinability: mach2D, error: `[DEBUG] Geometría 2D: dx=${bb.dx}`, details: `[DEBUG] Geometría 2D: dx=${bb.dx}` }
    }

    const center = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]
    const scale = bb.diag || 1
    const posN = positions.map(p => [(p[0] - center[0]) / scale, (p[1] - center[1]) / scale, (p[2] - center[2]) / scale])

    const kf = 1 / (Math.max(1e-9, baseEps) * 1e5)
    const uniq = new Map<string, number[]>()
    for (const [x, y, z] of posN) {
      const K = `${Math.round(x * kf)}|${Math.round(y * kf)}|${Math.round(z * kf)}`
      if (!uniq.has(K)) uniq.set(K, [x, y, z])
    }
    const hullPts = Array.from(uniq.values())

    const cellsOriented = orientFacesOutward(posN, cells)

    const vMeshN = Math.abs(meshVolume(cellsOriented, posN))
    let vHullN = 0
    const hullCells = convexHull(hullPts) as number[][]
    
    if (hullCells?.length) {
        vHullN = Math.abs(meshVolume(hullCells, hullPts))
    }
    
    const edgeStats = buildEdgeStats(posN, cellsOriented)
    const multiGrid = Math.min(100, (options.grid ?? 128))
    const multi = multiAxisConcavityRatios(posN, cellsOriented, multiGrid)

    const ratioRaw = (vHullN > 0) ? vMeshN / vHullN : 0
    const ratioClamped = clamp01(Number.isFinite(ratioRaw) ? ratioRaw : 0)

    const MULTI_MAX = 0.005 
    const EDGE_MAX  = 0.002 

    const multiMax = Math.max(multi.Z, multi.X, multi.Y)
    
    const volumePass = Number.isFinite(ratioRaw) && ratioRaw >= volTol
    const multiPass  = multiMax <= MULTI_MAX
    const edgePass   = edgeStats.concaveRatio <= EDGE_MAX
    
    const isConvex = multiPass && edgePass && (volumePass || ratioRaw > 0.95)

    let confidence = confidenceFromRatio(ratioRaw, badGap)
    if (!multiPass) confidence = Math.min(confidence, 20)
    confidence -= Math.min(40, Math.round(edgeStats.concaveRatio * 100000) / 25) 
    if (!edgeStats.watertight) {
      confidence = Math.min(confidence, 60) 
      confidence -= Math.min(20, Math.round(edgeStats.boundaryRatio * 100)) 
    }
    confidence = Math.max(0, Math.min(100, confidence))

    const mach = computeMachinabilityFromMesh(positions, cellsOriented, options)

    const volScale = Math.pow(scale, 3)
    const vMesh = vMeshN * volScale
    const vHull = vHullN * volScale

    const errorString = `[DEBUG] V=${vMesh.toExponential(4)} | H=${vHull.toExponential(4)} | ratio=${ratioRaw.toFixed(4)} | mach=${mach.failureReason ?? "OK"}`

    return {
      isConvex,
      meshVolume: vMesh,
      hullVolume: vHull,
      convexityRatio: ratioClamped,
      confidence,
      machinability: mach,
      error: errorString,
      details: errorString,
    }
  } catch (err: any) {
    return {
      isConvex: false,
      meshVolume: 0,
      hullVolume: 0,
      convexityRatio: 0,
      confidence: 0,
      machinability: { isThreeAxisMachable: false, accessibilityScore: 0, topFaceDownRatio: 1, undercutRatio: 1, overhangRatio: 1, baseFlatRatio: 0, samples: 0, details: "Error global." },
      error: err?.message || "Error desconocido",
      details: err?.message || "Error desconocido",
    }
  }
}

export default analyzeConvexity