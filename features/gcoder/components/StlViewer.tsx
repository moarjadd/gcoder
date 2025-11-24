"use client"

import { Canvas } from "@react-three/fiber"
import {
  OrbitControls,
  Grid,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Edges,
  ContactShadows,
} from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { STLLoader } from "three-stdlib"
import { useEffect, useState, useRef } from "react"
import * as THREE from "three"

interface StlViewerProps {
  data?: ArrayBuffer
  url?: string
  color?: string
  wireframe?: boolean
  zUp?: boolean
  autoRotate?: boolean
  modelRotation?: { x: number; y: number; z: number }
}

// --- Componente del Modelo STL ---
function StlModel({
  data,
  url,
  color = "var(--gc-green)",
  wireframe = false,
  zUp = true,
  modelRotation = { x: 0, y: 0, z: 0 },
  onDimensionsCalculated,
}: {
  data?: ArrayBuffer
  url?: string
  color: string
  wireframe: boolean
  zUp?: boolean
  modelRotation?: { x: number; y: number; z: number }
  onDimensionsCalculated?: (size: THREE.Vector3) => void
}) {
  const [baseGeometry, setBaseGeometry] =
    useState<THREE.BufferGeometry | null>(null)
  const [transformedGeometry, setTransformedGeometry] =
    useState<THREE.BufferGeometry | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // --- 1. Carga ---
  useEffect(() => {
    const loader = new STLLoader()
    let geo: THREE.BufferGeometry | null = null

    const onLoad = (g: THREE.BufferGeometry) => {
      g.computeVertexNormals()
      geo = g
      setBaseGeometry(g)
    }

    setBaseGeometry(null)
    setTransformedGeometry(null)

    if (data) {
      try {
        const g = loader.parse(data)
        onLoad(g)
      } catch (e) {
        console.error("Error parsing STL data:", e)
      }
    } else if (url) {
      loader.load(url, onLoad, undefined, (e) =>
        console.error("Error loading STL:", e),
      )
    }

    return () => {
      if (geo) geo.dispose()
      setBaseGeometry(null)
    }
  }, [data, url])

  // --- 2. Transformación ---
  useEffect(() => {
    if (!baseGeometry) {
      setTransformedGeometry(null)
      return
    }
    const geo = baseGeometry.clone()
    
    if (zUp) {
      geo.rotateX(-Math.PI / 2)
    }

    const euler = new THREE.Euler(
      modelRotation.x,
      modelRotation.y,
      modelRotation.z,
      "XYZ",
    )
    const matrix = new THREE.Matrix4()
    matrix.makeRotationFromEuler(euler)
    geo.applyMatrix4(matrix)

    geo.computeBoundingBox()
    if (geo.boundingBox) {
      const center = new THREE.Vector3()
      geo.boundingBox.getCenter(center)
      geo.translate(-center.x, -geo.boundingBox.min.y, -center.z)
    }
    setTransformedGeometry(geo)

    return () => {
      geo.dispose()
    }
  }, [baseGeometry, zUp, modelRotation])

  // --- 3. Escalado y Reporte de Dimensiones ---
  useEffect(() => {
    if (!transformedGeometry || !meshRef.current) return
    const m = meshRef.current

    if (!transformedGeometry.boundingBox) {
      transformedGeometry.computeBoundingBox()
    }
    const box = transformedGeometry.boundingBox
    if (!box) return

    const size = new THREE.Vector3()
    box.getSize(size)

    if (onDimensionsCalculated) {
      onDimensionsCalculated(size)
    }

    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      m.scale.setScalar(4 / maxDim)
    }
  }, [transformedGeometry, onDimensionsCalculated])

  if (!transformedGeometry) return null
  return (
    <mesh ref={meshRef} geometry={transformedGeometry}>
      <meshStandardMaterial
        color={color}
        wireframe={wireframe}
        metalness={0.1}
        roughness={0.3}
      />
      {!wireframe && (
        <Edges
          key={transformedGeometry.uuid}
          color="#8b5cf6"
          threshold={15}
        />
      )}
    </mesh>
  )
}

// --- Componente principal StlViewer ---
export default function StlViewer({
  data,
  url,
  color = "#22c55e",
  wireframe = false,
  zUp = true,
  autoRotate = false,
  modelRotation,
}: StlViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!)
  const [canvasKey, setCanvasKey] = useState(0)
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null)
  const [dimensions, setDimensions] = useState<THREE.Vector3 | null>(null)

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 1, 0)
      controlsRef.current.update()
    }
  }, [])

  useEffect(() => {
    if (!renderer) return
    const canvas = renderer.domElement
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      setCanvasKey((k) => k + 1)
    }
    canvas.addEventListener("webglcontextlost", handleContextLost as any)
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost as any)
    }
  }, [renderer])

  const formatRotationText = () => {
    const getDegrees = (rad: number | undefined) =>
      ((rad ?? 0) * 180) / Math.PI
    
    const rotX = getDegrees(modelRotation?.x).toFixed(0)
    const rotY = getDegrees(modelRotation?.y).toFixed(0) 
    const rotZ = getDegrees(modelRotation?.z).toFixed(0) 

    // Si todo es 0, mostramos SOLO "Base"
    if (rotX === "0" && rotY === "0" && rotZ === "0") {
      return "Base"
    }

    const parts = []
    if (rotX !== "0") parts.push(`X: ${rotX}°`)
    if (rotY !== "0") parts.push(`Y: ${rotY}°`) 
    if (rotZ !== "0") parts.push(`Z: ${rotZ}°`)

    return parts.join(", ")
  }

  if (!data && !url) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden bg-muted/10" />
    )
  }

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{
        background: "var(--gc-background-dark, #09090b)",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in oklch, var(--background) 92%, white 8%), color-mix(in oklch, var(--background) 88%, black 12%))",
      }}
    >
      <Canvas
        key={canvasKey}
        camera={{ position: [3.2, 2.2, 7.8], fov: 50, near: 0.1, far: 1000 }}
        style={{ background: "transparent" }}
        onCreated={(state) => {
          setRenderer(state.gl)
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />
        <Environment preset="studio" />

        <Grid
          args={[20, 20]}
          position={[0, 0, 0]}
          cellColor="#444"
          sectionColor="#666"
          fadeDistance={25}
          fadeStrength={1}
        />

        <ContactShadows
          position={[0, 0.001, 0]}
          scale={20}
          blur={1.5}
          far={3}
          opacity={0.7}
          color="#000000"
        />

        <StlModel
          data={data}
          url={url}
          color={color}
          wireframe={wireframe}
          zUp={zUp}
          modelRotation={modelRotation}
          onDimensionsCalculated={setDimensions}
        />

        <OrbitControls
          ref={controlsRef as any}
          makeDefault
          enablePan
          enableZoom
          enableRotate
          autoRotate={autoRotate}
          autoRotateSpeed={1}
          maxPolarAngle={Math.PI}
          minDistance={2}
          maxDistance={50}
        />

        <GizmoHelper
          alignment="top-left"
          margin={[80, 80]}
          onUpdate={() => {
            if (controlsRef.current) {
              const distance = controlsRef.current.getDistance()
              const newRotation = controlsRef.current.object.quaternion.clone()
              const newTarget = new THREE.Vector3(0, 1, 0)
              const newPosition = new THREE.Vector3(0, 0, distance)
              newPosition.applyQuaternion(newRotation)
              newPosition.add(newTarget)
              controlsRef.current.target.copy(newTarget)
              controlsRef.current.object.position.copy(newPosition)
              controlsRef.current.update()
            }
          }}
        >
          <GizmoViewport
            axisColors={["#ef4444", "#3b82f6", "#22c55e"]} 
            labels={["X", "Z", "Y"]}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>

      {/* HUD Information */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent text-white text-xs font-mono pointer-events-none">
        <div className="flex justify-between items-center gap-4">
          <span className="truncate">
            <strong>Medidas (mm): </strong>
            {dimensions
              ? (
                <>
                  {/* MANTENEMOS EL CRUCE DE MEDIDAS (Z es Altura) 
                    Three.js Y (Alto) -> Visual Z
                    Three.js Z (Profundo) -> Visual Y
                  */}
                  X: {dimensions.x.toFixed(2)} | Y: {dimensions.z.toFixed(2)} | Z: {dimensions.y.toFixed(2)}
                </>
              )
              : "Calculando..."}
          </span>
          <span className="flex-shrink-0">
            <strong>Rotación: </strong>
            {formatRotationText()}
          </span>
        </div>
      </div>
    </div>
  )
}