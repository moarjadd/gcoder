# Arquitectura

G-Coder V2 separa la interfaz visual del motor geométrico. La organización del repositorio busca que la tesis pueda defenderse por capas: UI, comunicación API, dominio G-Coder y algoritmos geométricos backend.

## Estructura General

- **Frontend (`frontend/`)**: Next.js, React 19, TypeScript, Tailwind, shadcn/ui y Three.js. Gestiona carga de STL, vista 3D, parámetros CNC, reporte y descarga `.nc`.
- **Backend (`backend/`)**: FastAPI con Trimesh, NumPy y Shapely. Es la fuente principal para validación, análisis de compatibilidad con CNC router de 3 ejes, slicing, trayectorias y G-code básico.
- **Documentación (`docs/`)**: notas de arquitectura, alcance y soporte académico para la tesis.

## Frontend

El frontend mantiene `app/` como entrada estándar de Next.js y concentra el dominio de tesis en `src/features/gcoder`.

```text
frontend/
  app/
  src/
    features/gcoder/
      api/
      components/
      hooks/
      legacy/
      types/
      utils/
    components/ui/
    components/layout/
    hooks/
    lib/
    types/
```

- `src/features/gcoder/api`: cliente HTTP hacia FastAPI. No contiene lógica geométrica principal; envía la transformación visual seleccionada como metadata JSON.
- `src/features/gcoder/components`: componentes específicos del flujo STL, visor, análisis, parámetros y G-code.
- `src/features/gcoder/hooks`: estado de la experiencia G-Coder.
- `src/features/gcoder/types`: contratos TypeScript para análisis, mecanizado y G-code.
- `src/features/gcoder/legacy`: lógica histórica de análisis en navegador. Se conserva solo como comparación temporal mientras el backend sigue siendo la fuente principal.
- `src/components/ui`: componentes genéricos shadcn/ui.
- `src/lib`: utilidades transversales como `cn`, constantes y lectura de entorno.

Esta separación evita mezclar componentes visuales genéricos con lógica específica de la tesis.

## Backend

```text
backend/app/
  routers/
  schemas/
  services/
  core/
```

- `routers`: reciben requests y devuelven responses.
- `schemas`: contratos Pydantic.
- `services`: coordinan el flujo de análisis o conversión.
- `core`: algoritmos geométricos y CAM básico, incluyendo aplicación de transformaciones de modelo.

El endpoint `POST /api/analyze` es la etapa principal previa a cualquier conversión. El backend es la fuente de verdad para decidir si un STL parece compatible con mecanizado CNC router de 3 ejes bajo reglas simplificadas.

## Flujo STL a G-code

1. El usuario carga un STL en la UI.
2. `POST /api/analyze` lee la malla con Trimesh, aplica rotación/escala si se enviaron, normaliza a coordenadas CNC, valida integridad básica y calcula una heurística de compatibilidad con mecanizado CNC router de 3 ejes.
3. Si el modelo parece compatible, el usuario configura parámetros de mecanizado.
4. `POST /api/convert` ejecuta:
   - aplicación de transformaciones del modelo,
   - normalización a coordenadas CNC,
   - validación de malla,
   - análisis de fabricabilidad vertical,
   - slicing manual por planos Z mediante intersección triángulo-plano,
   - generación básica de trayectorias con la estrategia principal `positive_part_external`,
   - postprocesado a G-code,
   - reporte de métricas.

```mermaid
flowchart TD
  A[Carga STL] --> B[Trimesh load]
  B --> C[Validación estructural]
  C --> D[Advertencias topológicas]
  D --> E[Análisis de fabricabilidad 3 ejes]
  E --> F[Evaluación de convexidad]
  F --> G[Estado operativo]
  G -->|Convierte| H[Slicing Z manual]
  H --> I[Toolpath positive_part_external]
  I --> J[G-code seguro]
  G -->|Rechaza| K[Reporte de errores y advertencias]
```

## Alcance

El MVP actual está diseñado solo para modelos STL compatibles con mecanizado CNC router de 3 ejes. Acepta geometrías convexas y también concavidades accesibles verticalmente si no hay socavados evidentes.

OBJ y PLY quedan como mejora futura de soporte de mallas. STEP e IGES quedan fuera del MVP porque requieren un pipeline CAD/B-Rep diferente.

No es un CAM industrial: no implementa simulación completa de remoción de material, detección perfecta de colisiones, selección automática avanzada de herramienta/material, optimización industrial ni mecanizado de 4 o 5 ejes.

## Slicing Z

Trimesh se usa para cargar y representar la malla STL. El slicing del backend no usa directamente `mesh.section(...)`; está implementado en `backend/app/core/slicer.py` mediante intersección manual de los triángulos de `mesh.triangles` contra planos horizontales en Z. El sistema calcula `minZ` y `maxZ` desde `mesh.bounds`, genera niveles desde `maxZ - step_down_mm` hacia niveles inferiores, proyecta los puntos de intersección a XY y reconstruye contornos 2D con Shapely (`LineString`, `polygonize`, `unary_union`).

Si una sección no cierra correctamente, se registra una advertencia. El slicer puede usar `convex_hull` como último recurso, pero no lo hace silenciosamente: la conversión reporta `convex_hull_fallback_used`, `slicing_fallback_used` y `geometry_preservation_warning`.

## Toolpath de Pieza Positiva

La estrategia principal para tesis es `positive_part_external`. En esta estrategia, el STL representa la pieza positiva a conservar, el stock representa el bloque inicial de material y las trayectorias se generan sobre el material externo sobrante. Aunque el código no guarda necesariamente una variable llamada `removal_area`, implementa la lógica equivalente mediante el área permitida para el centro de la herramienta:

```text
tool_radius = tool_diameter_mm / 2
piece_keepout = piece_polygon.buffer(tool_radius)
stock_inside = stock_polygon.buffer(-tool_radius)
tool_center_allowed_area = stock_inside - piece_keepout
```

El objetivo es evitar que el centro de la fresa invada el contorno protegido de la pieza. Las estrategias históricas `contour`, `zigzag` y `contour_parallel` se mantienen por compatibilidad y se reportan como `legacy_internal_pocket`, no como estrategia principal de tesis.

## Heurísticas de Fabricabilidad

La fabricabilidad no es una simulación CAM industrial. El backend usa reglas geométricas simplificadas: convexidad aproximada, área de superficies descendentes fuera de la base, muestreo vertical por columnas y puntaje de accesibilidad. Los umbrales actuales son:

- `convexity_ratio >= 0.98`: geometría probablemente convexa.
- `accessibility_score >= 0.7`: geometría probablemente accesible desde Z.
- `underside_area_ratio > 0.02`: riesgo de socavado.
- `complex_ratio > 0.08`: riesgo geométrico por múltiples intersecciones verticales.

Las mallas vacías, sin caras, sin vértices o con dimensiones inválidas se clasifican como `NO_APTO_MALLA_INVALIDA`. Una malla no watertight o con winding inconsistente genera advertencias topológicas; no bloquea siempre la conversión si la geometría sigue siendo procesable.

## Convención CNC

- Unidades: milímetros.
- Modo: coordenadas absolutas.
- Control objetivo: GRBL o controladores similares.
- Ejes de backend: `X` ancho, `Y` profundidad, `Z` altura vertical de mecanizado.
- `Z=0`: superficie superior del stock/modelo.
- Corte: valores Z negativos.
- `safe_z_mm`: altura positiva para traslados rápidos.
- Origen inicial recomendado: `bottom_left`, con margen XY.
- Después de aplicar rotación y escala, el backend traslada la malla para que `minZ=0` y evita coordenadas negativas innecesarias en `X/Y`.

## Transformaciones

El frontend no modifica físicamente el STL. El usuario puede rotar y escalar el modelo en la UI; esos valores se envían al backend como `transform` en `multipart/form-data`.

```json
{"rotation_x_deg":0,"rotation_y_deg":0,"rotation_z_deg":90,"scale":1.0}
```

El backend aplica esa transformación antes de validar, analizar, slicear y generar G-code. La orientación forma parte del estado de fabricabilidad porque cambia qué superficies son accesibles desde el eje vertical `Z` en una operación CNC router de 3 ejes.
