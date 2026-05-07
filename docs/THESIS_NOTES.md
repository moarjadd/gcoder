# Notas Para Tesis

## Problema

El sistema aborda la conversión automática de modelos 3D en formato STL a G-code para máquinas CNC router de 3 ejes, dentro de un alcance académico y experimental.

## Qué resuelve

El módulo backend de análisis permite cargar un STL, validar propiedades básicas de la malla y estimar si la geometría parece compatible con mecanizado CNC router de 3 ejes mediante una aproximación vertical. Esta etapa antecede a cualquier generación de G-code porque una trayectoria sobre una malla inválida o una geometría con socavados puede producir resultados inseguros o técnicamente indefendibles.

## Qué no resuelve

No reemplaza un CAM industrial. No garantiza mecanizar cualquier STL. No realiza optimización avanzada, simulación física completa, detección perfecta de colisiones ni selección automática ideal de herramienta/material. Tampoco implementa mecanizado de 4 o 5 ejes.

## Fabricabilidad

“Fabricable” en este prototipo significa que el modelo parece compatible con una herramienta vertical de 3 ejes bajo reglas simplificadas. El análisis acepta concavidades accesibles desde Z, pero marca como riesgo los socavados, superficies ocultas o múltiples intersecciones verticales complejas.

## Arquitectura del sistema desarrollado

El sistema se organiza como una aplicación web por capas. El frontend, construido con Next.js y React, cumple el rol de interfaz de interacción: carga de archivos STL, visualización 3D, configuración de parámetros y presentación de resultados. La lógica específica de la tesis se concentra en `features/gcoder`, separando componentes visuales, hooks, cliente API, tipos y utilidades.

El backend, construido con FastAPI, cumple el rol de motor de análisis geométrico. Sus routers exponen endpoints, los servicios coordinan el flujo y el núcleo geométrico usa Trimesh y NumPy para validar mallas y estimar compatibilidad con mecanizado CNC router de 3 ejes.

El endpoint `/api/analyze` representa la etapa previa a la conversión STL a G-code. Esta separación permite probar el análisis de forma aislada, comparar casos de estudio y documentar resultados sin depender de la interfaz visual. Metodológicamente, facilita repetir experimentos y justificar por qué un modelo es aceptado con advertencias, rechazado por malla inválida o marcado como no compatible por geometría.

La orientación del modelo se considera parte del problema de fabricabilidad. En CNC router de 3 ejes el eje `Z` es la dirección vertical de mecanizado; por lo tanto, rotar la pieza puede cambiar qué caras son accesibles, si existe una base adecuada y si aparecen posibles socavados.

## Endpoint `/api/analyze`

El endpoint `POST /api/analyze` recibe archivos STL ASCII o binarios mediante `multipart/form-data`. Devuelve métricas geométricas, validación de malla, advertencias, errores, tiempo de procesamiento y un estado clasificable:

- `APTO_PARA_CONVERSION`: malla válida y geometría aparentemente compatible.
- `APTO_CON_ADVERTENCIAS`: malla analizable, pero con advertencias que deben revisarse.
- `NO_APTO_MALLA_INVALIDA`: errores graves de malla.
- `NO_APTO_POR_GEOMETRIA`: posibles socavados o geometría no compatible con la aproximación vertical.

La heurística usa propiedades de Trimesh, volumen aproximado, convex hull, normales, bounding box y muestreo vertical simplificado. No equivale a una simulación CAM completa ni garantiza fabricación física.

El endpoint acepta opcionalmente un campo `transform` como JSON. El backend aplica escala uniforme y rotaciones X/Y/Z en grados antes de validar la malla. Luego normaliza la geometría a coordenadas CNC: `X` ancho, `Y` profundidad, `Z` altura vertical, con `minZ=0`. La respuesta incluye `transformApplied` y las dimensiones corresponden al modelo transformado.

## Métricas

El reporte de conversión incluye tiempo de procesamiento, número de capas, movimientos de herramienta, líneas de G-code, longitud estimada de trayectoria, límites XYZ, warnings y anomalías. La métrica RMSE queda preparada como `null` porque requiere una comparación geométrica posterior entre material removido y modelo objetivo; inventarla daría una precisión falsa.

## Estado funcional del prototipo MVP

El prototipo MVP permite cargar archivos STL desde el frontend, enviarlos al backend FastAPI para análisis, validar propiedades básicas de la malla y estimar compatibilidad con mecanizado CNC router de 3 ejes. Si el modelo es válido y compatible, el usuario puede configurar parámetros CNC básicos y solicitar la conversión.

La conversión actual ejecuta slicing básico por capas, genera trayectorias simples, produce G-code con encabezado seguro (`G21`, `G90`, `G17`, `G94`, `G54`), eleva a `safe_z_mm`, enciende el husillo con `M3 S...` y finaliza con `M5` y `M30`. El frontend muestra el G-code, un reporte simple de capas/movimientos/advertencias/anomalías y permite descargar un archivo `.nc`.

Limitaciones: solo se soporta STL; la compatibilidad 3 ejes es heurística; no hay simulación CAM industrial, detección perfecta de colisiones ni cálculo real de RMSE; el G-code debe validarse antes de ejecutarse en una máquina real.

La conversión usa la misma transformación aplicada en el análisis. Si el usuario modifica rotación o escala en el frontend después de analizar, debe reanalizar antes de generar G-code para mantener coherencia entre orientación visual y procesamiento backend.

## Validación inicial del MVP mediante casos STL controlados

Para endurecer el endpoint `/api/convert` se incorporó un conjunto pequeño de casos STL generados por código con Trimesh dentro de la suite de pruebas backend. Este dataset inicial evita depender de archivos externos y permite repetir las pruebas de forma determinística.

Casos incluidos:

- Caja/cubo: sólido cerrado simple, esperado como convertible.
- Prisma rectangular: sólido cerrado con proporciones distintas, esperado como convertible.
- Cilindro simple: sólido facetado cerrado, esperado como convertible.
- Cono simple: sólido cerrado con sección variable, esperado como convertible.
- Semicilindro/D-shape con cara plana en la base: caso orientado para ser más favorable al mecanizado vertical.
- Semicilindro/D-shape con curva hacia la base: caso orientado para evidenciar superficies descendentes y menor accesibilidad.
- Malla plana inválida: triángulos coplanares sin volumen útil, esperada como rechazo por malla inválida.
- Geometría con posible socavado/overhang: composición de volúmenes que genera superficies descendentes fuera de la base, esperada como rechazo por geometría no apta para CNC router de 3 ejes bajo la heurística actual.

Las pruebas verifican conversión exitosa en modelos válidos, rechazo de mallas inválidas, rechazo de geometrías con posible socavado, G-code no vacío, encabezado CNC completo (`G21`, `G90`, `G17`, `G94`, `G54`), footer (`M5`, `M30`) y elevación a `safe_z_mm` antes de movimientos rápidos en XY.

El reporte JSON de conversión queda preparado para uso experimental con campos explícitos: `model_name`, `status`, `layer_count`, `toolpath_move_count`, `gcode_line_count`, `processing_time_seconds`, `warnings`, `anomalies` y `parameters_used`. No se inventa RMSE ni se afirma precisión física; cualquier métrica de precisión requiere una comparación geométrica posterior entre material removido simulado y modelo objetivo.

El caso semicilindro/D-shape demuestra que la orientación del mismo tipo de pieza cambia el análisis de fabricabilidad: con la cara plana apoyada en `Z=0` la base es clara y el puntaje de accesibilidad es mayor; con la superficie curva orientada hacia la base aparecen superficies descendentes fuera de la zona base y el puntaje de accesibilidad disminuye. Esto justifica aplicar las transformaciones en el backend antes del análisis, porque la orientación visual seleccionada por el usuario forma parte de la posición real de mecanizado.

La detección sigue siendo heurística. El sistema no resuelve colisiones ni simula remoción de material; solo usa señales geométricas simplificadas como planitud de base, normales descendentes, convexidad y muestreo vertical para advertir o rechazar casos potencialmente no aptos.

## Uso en capítulo IV

Para resultados se pueden comparar modelos de prueba por cantidad de triángulos, estado de validación, compatibilidad 3 ejes y tiempo de procesamiento del análisis. También se pueden discutir casos rechazados por socavados o mallas inválidas como evidencia de límites del prototipo.

## Evaluación batch del dataset controlado

Se agregó una evaluación batch automática para ejecutar el flujo real del backend sobre el dataset STL controlado. El script se ejecuta desde `backend` con:

```bash
python scripts/run_batch_evaluation.py
```

El resultado se guarda en `backend/reports/batch_evaluation.json`. El JSON incluye metadata general (`generated_at`, proyecto, alcance, cantidad de modelos), un resumen agregado y una entrada por modelo.

Modelos evaluados:

- `cube.stl`
- `rectangular-prism.stl`
- `cylinder.stl`
- `cone.stl`
- `invalid-flat.stl`
- `overhang.stl`
- `semicylinder_flat_base.stl`
- `semicylinder_curved_base.stl`

Por cada modelo se registran categoría, comportamiento esperado, estado de análisis, validez de malla, compatibilidad CNC router de 3 ejes, convexidad aproximada, posibles socavados, `accessibilityScore`, `baseFlatnessScore`, advertencias, errores, estado de conversión, cantidad de capas, movimientos de herramienta, líneas de G-code, tiempo de procesamiento y parámetros CNC usados.

Este reporte puede usarse como evidencia inicial en la tesis porque permite comparar casos válidos, inválidos y no aptos bajo el mismo pipeline reproducible. Los modelos no aptos no hacen fallar el script; quedan registrados como rechazados o no convertidos junto con el motivo.

Limitaciones: no calcula RMSE, no simula remoción física de material, no verifica colisiones reales y no reemplaza un CAM industrial. La evaluación mide comportamiento del prototipo bajo heurísticas geométricas controladas.
