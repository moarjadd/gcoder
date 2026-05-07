import numpy as np


def validate_mesh(mesh):
    warnings: list[str] = []
    errors: list[str] = []

    face_count = int(len(mesh.faces))
    vertex_count = int(len(mesh.vertices))
    is_empty = bool(mesh.is_empty or face_count == 0 or vertex_count == 0)
    is_watertight = bool(mesh.is_watertight) if not is_empty else False
    is_winding_consistent = bool(mesh.is_winding_consistent) if not is_empty else False

    if is_empty:
        errors.append("La malla no contiene triángulos procesables.")

    vertices_finite = bool(np.isfinite(mesh.vertices).all()) if vertex_count else False
    if not vertices_finite:
        errors.append("La malla contiene coordenadas inválidas o infinitas.")

    areas = np.asarray(mesh.area_faces) if face_count else np.array([])
    degenerate_faces_count = int(np.count_nonzero(areas <= 1e-12))
    if degenerate_faces_count:
        warnings.append(f"Se detectaron {degenerate_faces_count} caras degeneradas o casi planas.")

    if face_count > 250_000:
        warnings.append(
            "La malla tiene una cantidad alta de triángulos; el análisis es válido, pero el procesamiento puede ser lento."
        )

    if not is_watertight:
        warnings.append(
            "La malla no está completamente cerrada; el análisis y el slicing pueden ser aproximados."
        )

    if not is_winding_consistent:
        warnings.append("La orientación de algunas caras puede ser inconsistente.")

    bounds = None
    dimensions = [0.0, 0.0, 0.0]
    if not is_empty and vertices_finite:
        raw_bounds = np.asarray(mesh.bounds, dtype=float)
        bounds = {"min": raw_bounds[0].tolist(), "max": raw_bounds[1].tolist()}
        dimensions = (raw_bounds[1] - raw_bounds[0]).tolist()
        if any(d <= 1e-6 for d in dimensions):
            errors.append("El modelo tiene dimensiones nulas o demasiado pequeñas.")

    return {
        "isWatertight": is_watertight,
        "isWindingConsistent": is_winding_consistent,
        "isEmpty": is_empty,
        "faceCount": face_count,
        "vertexCount": vertex_count,
        "degenerateFacesCount": degenerate_faces_count,
        "bounds": bounds,
        "dimensions": dimensions,
        "warnings": warnings,
        "errors": errors,
        "isValid": len(errors) == 0,
    }
