# G-Coder Backend

Motor geométrico básico para analizar modelos STL y preparar una conversión segura de modelos compatibles con mecanizado CNC router de 3 ejes. El MVP actual soporta solo STL.

## Ejecutar

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
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

## Parámetros CNC soportados

- `tool_diameter_mm`
- `step_down_mm`
- `step_over_mm`
- `feed_rate_mm_min`
- `plunge_rate_mm_min`
- `spindle_rpm`
- `safe_z_mm`
- `tolerance_mm`
- `strategy`

Valores por defecto principales: herramienta `3.175 mm`, step down `1.0 mm`, stepover `1.5 mm`, avance XY `800 mm/min`, avance Z `200 mm/min`, spindle `12000 RPM`, Z seguro `5.0 mm`, tolerancia `0.1 mm`, estrategia `contour_parallel`.

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

El backend no promete mecanizar cualquier STL ni sustituir un CAM industrial. Advierte o rechaza modelos con errores graves o posibles socavados según heurísticas simplificadas.

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

Incluye metadata, resumen agregado, análisis, estado de conversión, advertencias, anomalías y parámetros CNC usados por modelo. No calcula RMSE ni sustituye simulación CAM industrial.
