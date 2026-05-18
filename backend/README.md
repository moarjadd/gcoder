# G-Coder Backend

Motor geométrico básico para analizar modelos STL y preparar una conversión segura de modelos compatibles con mecanizado CNC router de 3 ejes. El MVP actual soporta solo STL.

## Ejecutar

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

API local: `http://127.0.0.1:8000`

## Endpoints

- `GET /api/health`: estado del servicio.
- `POST /api/analyze`: recibe `file` y opcionalmente `transform` JSON como FormData. Devuelve validación de malla, dimensiones transformadas y compatibilidad con CNC router de 3 ejes.
- `POST /api/convert`: recibe `file`, `params` JSON y opcionalmente `transform` JSON como FormData. Devuelve G-code, conteo de líneas y reporte de métricas.

Los routers solo reciben la petición. La coordinación vive en `app/services` y los algoritmos geométricos viven en `app/core`.

## Probar health

```bash
curl http://127.0.0.1:8000/api/health
```

Respuesta esperada:

```json
{"status":"ok","service":"gcoder-backend"}
```

## Probar analyze

Con Swagger:

1. Ejecuta el backend.
2. Abre `http://127.0.0.1:8000/docs`.
3. Usa `POST /api/analyze` y carga un archivo `.stl`.

Con curl:

```bash
curl -X POST http://127.0.0.1:8000/api/analyze ^
  -F "file=@pieza.stl" ^
  -F "transform={\"rotation_x_deg\":0,\"rotation_y_deg\":0,\"rotation_z_deg\":90,\"scale\":1.0}"
```

La respuesta incluye:

- tamaño del archivo,
- cantidad de triángulos y vértices,
- bounding box y dimensiones,
- transformación aplicada,
- volumen aproximado si la malla es cerrada,
- errores y advertencias de validación,
- análisis heurístico de compatibilidad con mecanizado CNC router de 3 ejes,
- estado de tesis: `APTO_PARA_CONVERSION`, `APTO_CON_ADVERTENCIAS`, `NO_APTO_MALLA_INVALIDA` o `NO_APTO_POR_GEOMETRIA`.

El análisis no garantiza fabricación real. Indica si el modelo parece compatible bajo reglas simplificadas y recomienda validar trayectorias antes de ejecutar en máquina.

Las mallas vacías, sin caras, sin vértices o con dimensiones inválidas se consideran no aptas por malla inválida. En cambio, una malla no watertight o con winding inconsistente genera advertencias topológicas; puede continuar si no hay errores estructurales graves y la geometría resulta procesable.

## Parámetros CNC soportados

- `tool_diameter_mm`
- `step_down_mm`
- `step_over_mm`
- `feed_rate_mm_min`
- `plunge_rate_mm_min`
- `spindle_rpm`
- `safe_z_mm`
- `stock_margin_mm`
- `tolerance_mm`
- `strategy`
- `origin`
- `units`

Valores por defecto principales: herramienta `3.175 mm`, step down `1.0 mm`, stepover `1.5 mm`, avance XY `800 mm/min`, avance Z `200 mm/min`, spindle `12000 RPM`, Z seguro `5.0 mm`, margen de stock `6.0 mm`, tolerancia `0.1 mm`, estrategia `positive_part_external`, origen `bottom_left` y unidades `mm`.

El usuario configura los parámetros principales desde el frontend. `tolerance_mm` existe en el backend y en los tipos/defaults del frontend, pero no se expone como campo editable principal. `units` está restringido a milímetros y se materializa en el G-code mediante `G21`.

Uso real de parámetros:

- `tool_diameter_mm`: calcula `tool_radius = tool_diameter_mm / 2` para compensación de herramienta.
- `step_down_mm`: controla los niveles Z del slicing.
- `step_over_mm`: separa pasadas laterales dentro del área externa permitida.
- `feed_rate_mm_min`: se emite como `F` en movimientos lineales XY.
- `plunge_rate_mm_min`: se emite como `F` al bajar en Z.
- `spindle_rpm`: se emite como `M3 S...`.
- `safe_z_mm`: define la altura segura antes de movimientos rápidos XY y al finalizar.
- `stock_margin_mm`: expande el stock exterior alrededor de la pieza.
- `strategy`: selecciona la estrategia de toolpath; la principal para tesis es `positive_part_external`.
- `origin`: controla el mapeo XY final, por ejemplo `bottom_left` o `center`.

## Transformaciones del modelo

El backend acepta una transformación opcional:

```json
{
  "rotation_x_deg": 0,
  "rotation_y_deg": 0,
  "rotation_z_deg": 90,
  "scale": 1.0
}
```

La transformación se aplica antes de validación, fabricabilidad, slicing, toolpath y G-code. Si no se envía, se usa identidad. Las rotaciones se normalizan a `0-360` y `scale` debe ser mayor que `0`.

## Convención de coordenadas y G-code

- Unidades en milímetros (`G21`).
- Coordenadas absolutas (`G90`).
- Plano XY (`G17`).
- Avance por minuto (`G94`).
- Sistema de coordenadas de trabajo (`G54`).
- Convención geométrica interna: `X` ancho, `Y` profundidad, `Z` altura vertical CNC.
- `Z=0` de máquina representa la superficie superior del stock/modelo.
- El corte se expresa con Z negativo.
- En origen `bottom_left`, el modelo se traslada al cuadrante positivo y se aplica margen XY.
- Tras rotar/escalar, el backend normaliza la malla para que `minZ=0` y `minX/minY=0`.
- El programa sube a `safe_z_mm` antes de traslados rápidos XY.
- Footer: `M5`, `M30`.

Header exacto generado por el postprocesador:

```gcode
G21
G90
G17
G94
G54
G0 Z{safe_z_mm}
M3 S{spindle_rpm}
```

Footer exacto:

```gcode
G0 Z{safe_z_mm}
M5
M30
```

El postprocesador también inserta una subida a `safe_z_mm` antes de cualquier movimiento rápido XY si la herramienta está por debajo de la altura segura.

## Slicing, huecos internos y compensación de herramienta

Trimesh se usa para cargar y representar la malla STL. El slicing no llama directamente a `mesh.section(...)`; el backend implementa el corte mediante intersección manual triángulo-plano sobre `mesh.triangles`. Para cada nivel Z calculado con `step_down_mm`, se intersectan triángulos contra un plano horizontal, se proyectan los puntos a XY y se reconstruyen contornos 2D usando Shapely (`LineString`, `polygonize`, `unary_union`).

Las capas ya no se tratan como una lista plana de contornos. Cada capa mantiene una geometría Shapely con `Polygon`/`MultiPolygon`, exteriores e interiores. Esto permite conservar huecos internos verticalmente accesibles, por ejemplo anillos, marcos rectangulares o letras tipo “O”. El reporte de conversión incluye metadatos como `total_holes_detected`, `total_holes_preserved`, `hole_preservation_rate`, `layer_geometry_warnings`, `geometry_repair_used` y `lost_holes_detected`.

Si una sección no cierra correctamente, el slicer intenta reconstruirla con `unary_union`. Como último recurso puede usar `convex_hull`, pero el resultado queda marcado con `convex_hull_fallback_used`, `slicing_fallback_used` y `geometry_preservation_warning`. El fallback no se usa silenciosamente para tapar huecos: si se detecta pérdida de interiores, se reporta como advertencia fuerte.

En la estrategia principal `positive_part_external`, el STL es la pieza positiva a conservar. El código no guarda necesariamente una variable llamada `removal_area`, pero implementa la lógica equivalente mediante el área permitida para el centro de la herramienta:

```text
tool_radius = tool_diameter_mm / 2
piece_keepout = piece_polygon.buffer(tool_radius)
stock_inside = stock_polygon.buffer(-tool_radius)
tool_center_allowed_area = stock_inside - piece_keepout
```

El objetivo es que el centro de la fresa se mueva sobre el material externo sobrante y no invada la pieza. Las estrategias históricas `contour`, `zigzag` y `contour_parallel` se conservan para compatibilidad, pero se reportan como `legacy_internal_pocket`.

Si la pieza tiene huecos internos, el área permitida para herramienta incluye el material del hueco siempre que el radio de herramienta permita entrar. Si un hueco es menor que el diámetro efectivo de herramienta, la conversión no lo rellena silenciosamente: agrega warnings/códigos como `HOLE_TOO_SMALL_FOR_TOOL` y `HOLE_PRESERVATION_INCOMPLETE`.

El backend no promete mecanizar cualquier STL ni sustituir un CAM industrial. Advierte o rechaza modelos con errores graves o posibles socavados según heurísticas simplificadas.

## Precisión dimensional aproximada 2.5D

El reporte de `/api/convert` calcula métricas geométricas reproducibles por capas cuando existen geometrías comparables:

- `rmse_mm`
- `mean_error_mm`
- `max_error_mm`
- `area_error_percent`
- `compared_layers`
- `skipped_layers`
- `hole_preservation_rate`
- `total_holes_detected`
- `total_holes_preserved`

La métrica compara contornos de la geometría objetivo de cada capa contra una geometría nominal compensada por radio de herramienta. Muestrea exteriores e interiores, por lo que los huecos cuentan en la precisión. No compara directamente el centro de herramienta contra el borde STL sin compensación y no sustituye una simulación física completa de remoción de material. `rmse_mm` solo queda en `null` si no hay capas con geometría comparable; en ese caso se agrega un warning técnico en `layer_geometry_warnings`.

## Pruebas

```bash
cd backend
pytest
```

## Evaluación batch del dataset controlado

Para generar evidencia JSON del MVP sobre los modelos STL controlados:

```bash
cd backend
python scripts/run_batch_evaluation.py
```

El reporte se escribe en:

```text
backend/reports/batch_evaluation.json
```

Incluye metadata, resumen agregado, análisis, estado de conversión, advertencias, anomalías, parámetros CNC usados y métricas 2.5D cuando la conversión produce capas comparables. No sustituye simulación CAM industrial.
