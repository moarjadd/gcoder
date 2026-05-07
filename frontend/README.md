# G-Coder Frontend

Interfaz Next.js para cargar, visualizar, analizar y convertir STL mediante el backend FastAPI. El MVP actual trabaja solo con archivos `.stl`.

## Ejecutar

```bash
cd frontend
npm install
npm run dev
```

Por defecto consume `http://127.0.0.1:8000`. Para cambiarlo:

```bash
set NEXT_PUBLIC_GCODER_API_URL=http://127.0.0.1:8000
npm run dev
```

Variable de entorno:

- `NEXT_PUBLIC_GCODER_API_URL`: URL base del backend FastAPI.

## Flujo

1. Cargar archivo STL.
2. Ajustar rotación o escala si hace falta.
3. Analizar en el backend enviando el STL original más la transformación seleccionada.
4. Revisar validación y compatibilidad con mecanizado CNC de 3 ejes.
5. Ajustar parámetros CNC.
6. Convertir y descargar `.nc`.

La lógica antigua en TypeScript puede seguir existiendo como referencia, pero la fuente principal de análisis y conversión es el backend. El frontend no modifica físicamente el STL; envía `rotation_x_deg`, `rotation_y_deg`, `rotation_z_deg` y `scale` para que FastAPI aplique la transformación sobre la malla antes de analizar o convertir.

El sistema no promete convertir cualquier STL. Solo debe usarse con modelos compatibles con mecanizado CNC router de 3 ejes y el G-code debe validarse antes de ejecutarse en máquina real.

## Estructura

```text
frontend/
  app/                         # Rutas y estilos globales de Next.js
  src/
    features/gcoder/
      api/                     # Cliente HTTP hacia FastAPI
      components/
        analysis/
        gcode/
        layout/
        parameters/
        upload/
        viewer/
      hooks/                   # Estado del flujo G-Coder
      legacy/                  # Lógica histórica en navegador
      types/                   # Contratos TypeScript
      utils/                   # Utilidades del dominio
    components/ui/             # shadcn/ui genérico
    components/layout/         # Layout genérico
    hooks/                     # Hooks compartidos
    lib/                       # Utilidades transversales
    types/                     # Tipos globales
```

El backend es la fuente principal para analizar STL. Los archivos en `features/gcoder/legacy` no son la ruta oficial de análisis ni conversión; se conservan temporalmente como referencia histórica/fallback.
