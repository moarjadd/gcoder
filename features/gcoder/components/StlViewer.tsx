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
import type { OrbitControls as OrbitControlsType } from "three-stdlib"
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

// --- Componente del Modelo STL (CON CAMBIOS) ---
function StlModel({
  data,
  url,
  color = "var(--gc-green)",
  wireframe = false,
  zUp = true,
  modelRotation = { x: 0, y: 0, z: 0 },
  onDimensionsCalculated, // 💡 NUEVA PROP
}: {
  data?: ArrayBuffer
  url?: string
  color: string
  wireframe: boolean
  zUp?: boolean
  modelRotation?: { x: number; y: number; z: number }
  onDimensionsCalculated?: (size: THREE.Vector3) => void // 💡 TIPO DE LA NUEVA PROP
}) {
  // ... (Estados baseGeometry, transformedGeometry, meshRef sin cambios) ...
  const [baseGeometry, setBaseGeometry] =
    useState<THREE.BufferGeometry | null>(null)
  const [transformedGeometry, setTransformedGeometry] =
    useState<THREE.BufferGeometry | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // --- 1. useEffect de CARGA ---
  // ... (Sin cambios) ...
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
      if (geo) {
        geo.dispose()
      }
      setBaseGeometry(null)
    }
  }, [data, url])

  // --- 2. useEffect de TRANSFORMACIÓN ---
  // ... (Sin cambios) ...
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

  // --- 3. useEffect de ESCALADO (CON CAMBIOS) ---
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

    // 💡 PASAR DATOS "HACIA ARRIBA"
    // Aquí enviamos las dimensiones reales (sin escalar) al componente padre
    if (onDimensionsCalculated) {
      onDimensionsCalculated(size)
    }

    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      m.scale.setScalar(4 / maxDim)
    }
  }, [transformedGeometry, onDimensionsCalculated]) // 💡 AÑADIDA DEPENDENCIA

  // --- Renderizado ---
  // ... (Sin cambios) ...
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

// --- Componente principal StlViewer (CON CAMBIOS) ---
export default function StlViewer({
  data,
  url,
  color = "#22c55e",
  wireframe = false,
  zUp = true,
  autoRotate = false,
  modelRotation, // Recibimos la rotación en radianes
}: StlViewerProps) {
  const controlsRef = useRef<OrbitControlsType>(null!)

  // 💡 ESTADO PARA GUARDAR LAS DIMENSIONES
  const [dimensions, setDimensions] = useState<THREE.Vector3 | null>(null)

  // Efecto para setear el target inicial (corrige bug de gizmo/pan)
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 1, 0)
      controlsRef.current.update()
    }
  }, [])

  // 💡 HELPER PARA FORMATEAR LA ROTACIÓN DE RADIANES A GRADOS
  const formatRotationText = () => {
    const getDegrees = (rad: number | undefined) =>
      ((rad ?? 0) * 180) / Math.PI
    
    const rotX = getDegrees(modelRotation?.x).toFixed(0)
    const rotY = getDegrees(modelRotation?.y).toFixed(0)
    const rotZ = getDegrees(modelRotation?.z).toFixed(0)

    const parts = []
    if (rotX !== "0") parts.push(`X: ${rotX}°`)
    if (rotY !== "0") parts.push(`Y: ${rotY}°`)
    if (rotZ !== "0") parts.push(`Z: ${rotZ}°`)

    if (parts.length === 0) return "Base (0°, 0°, 0°)"
    return parts.join(", ")
  }

  if (!data && !url) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden bg-muted/10" />
    )
  }

  return (
    // 💡 DIV CONTENEDOR 'relative' PARA POSICIONAR EL HUD
    <div
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{
        background: "var(--background)",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in oklch, var(--background) 92%, white 8%), color-mix(in oklch, var(--background) 88%, black 12%))",
      }}
    >
      <Canvas
        camera={{ position: [3.2, 2.2, 7.8], fov: 50, near: 0.1, far: 1000 }}
        style={{ background: "transparent" }}
      >
        {/* --- Luces y Entorno --- */}
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

        {/* --- Rejilla (Cama) --- */}
        <Grid
          args={[20, 20]}
          position={[0, 0, 0]}
          cellColor="#444"
          sectionColor="#666"
          fadeDistance={25}
          fadeStrength={1}
        />

        {/* SOMBRAS */}
        <ContactShadows
          position={[0, 0.001, 0]}
          scale={20}
          blur={1.5}
          far={3}
          opacity={0.7}
          color="#000000"
        />

        {/* --- Modelo STL --- */}
        <StlModel
          data={data}
          url={url}
          color={color}
          wireframe={wireframe}
          zUp={zUp}
          modelRotation={modelRotation}
          onDimensionsCalculated={setDimensions} // 💡 PASANDO EL CALLBACK
        />

        {/* --- Controles de Cámara --- */}
        <OrbitControls
          ref={controlsRef}
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

        {/* --- Brújula/Gizmo (CON LÓGICA DE REINICIO DE PAN) --- */}
        <GizmoHelper
          alignment="top-left"
          margin={[80, 80]}
          controls={controlsRef}
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
            axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>

      {/* 💡 INICIO: NUEVO BLOQUE DE INFORMACIÓN (HUD) */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent text-white text-xs font-mono pointer-events-none">
        <div className="flex justify-between items-center gap-4">
          {/* Medidas */}
          <span className="truncate">
            <strong>Medidas (mm): </strong>
            {dimensions
              ? `X: ${dimensions.x.toFixed(2)} | Y: ${dimensions.y.toFixed(
                  2,
                )} | Z: ${dimensions.z.toFixed(2)}`
              : "Calculando..."}
          </span>
          {/* Rotación */}
          <span className="flex-shrink-0">
            <strong>Rotación: </strong>
            {formatRotationText()}
          </span>
        </div>
      </div>
      {/* 💡 FIN: NUEVO BLOQUE DE INFORMACIÓN (HUD) */}
    </div>
  )
}
