# G-Coder V2

MVP académico para cargar modelos STL, validar su malla, estimar compatibilidad con CNC router de 3 ejes y generar G-code básico descargable como `.nc`.

## Alcance

G-Coder V2 no busca reemplazar un CAM industrial ni convertir cualquier STL. El formato soportado actualmente en este MVP es solo STL. OBJ, PLY, STEP e IGES no están implementados.

El flujo soportado es:

`STL -> validación de malla -> análisis de compatibilidad CNC de 3 ejes -> slicing -> trayectorias básicas -> G-code -> reporte`

El sistema acepta modelos convexos y geometrías con concavidades accesibles verticalmente, siempre que no presenten socavados evidentes.

## Ejecutar

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

URLs por defecto:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`

## Flujo de uso para demo

1. Ejecutar backend FastAPI.
2. Ejecutar frontend Next.js.
3. Cargar un archivo `.stl`.
4. Analizar el modelo con el backend.
5. Revisar validación, advertencias y compatibilidad CNC router de 3 ejes.
6. Ajustar parámetros CNC.
7. Generar G-code desde `/api/convert`.
8. Revisar el reporte y descargar el archivo `.nc`.

## Limitaciones actuales

- Solo soporta STL.
- El análisis de compatibilidad 3 ejes usa heurísticas, no una simulación CAM industrial.
- El G-code generado debe validarse antes de ejecutarse en una máquina real.
- No calcula RMSE ni métricas de precisión física todavía.

## Documentación

- `docs/ARCHITECTURE.md`
- `docs/THESIS_NOTES.md`
- `backend/README.md`
- `frontend/README.md`
