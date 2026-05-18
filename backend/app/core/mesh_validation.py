import numpy as np


DEGENERATE_FACE_AREA_EPSILON = 1e-12
HIGH_TRIANGLE_COUNT_THRESHOLD = 250_000
MIN_DIMENSION_MM = 1e-6


def validate_mesh(mesh):
    warnings: list[str] = []
    errors: list[str] = []
    warning_codes: list[str] = []
    error_codes: list[str] = []

    face_count = int(len(mesh.faces))
    vertex_count = int(len(mesh.vertices))
    is_empty = bool(mesh.is_empty or face_count == 0 or vertex_count == 0)
    is_watertight = bool(mesh.is_watertight) if not is_empty else False
    is_winding_consistent = bool(mesh.is_winding_consistent) if not is_empty else False

    if is_empty:
        errors.append("La malla no contiene triángulos procesables.")
        error_codes.append("mesh_empty")

    vertices_finite = bool(np.isfinite(mesh.vertices).all()) if vertex_count else False
    if not vertices_finite:
        errors.append("La malla contiene coordenadas inválidas o infinitas.")
        error_codes.append("non_finite_vertices")

    areas = np.asarray(mesh.area_faces) if face_count else np.array([])
    degenerate_faces_count = int(np.count_nonzero(areas <= DEGENERATE_FACE_AREA_EPSILON))
    if degenerate_faces_count:
        warnings.append(f"Se detectaron {degenerate_faces_count} caras degeneradas o casi planas.")
        warning_codes.append("degenerate_faces_detected")

    if face_count > HIGH_TRIANGLE_COUNT_THRESHOLD:
        warnings.append(
            "La malla tiene una cantidad alta de triángulos; el análisis es válido, pero el procesamiento puede ser lento."
        )
        warning_codes.append("high_triangle_count")

    if not is_watertight:
        warnings.append(
            "La malla no está completamente cerrada; el análisis y el slicing pueden ser aproximados."
        )
        warning_codes.append("not_watertight")

    if not is_winding_consistent:
        warnings.append("La orientación de algunas caras puede ser inconsistente.")
        warning_codes.append("winding_inconsistent")

    bounds = None
    dimensions = [0.0, 0.0, 0.0]
    if not is_empty and vertices_finite:
        raw_bounds = np.asarray(mesh.bounds, dtype=float)
        bounds = {"min": raw_bounds[0].tolist(), "max": raw_bounds[1].tolist()}
        dimensions = (raw_bounds[1] - raw_bounds[0]).tolist()
        if any(d <= MIN_DIMENSION_MM for d in dimensions):
            errors.append("El modelo tiene dimensiones nulas o demasiado pequeñas.")
            error_codes.append("dimensions_too_small")

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
        "warningCodes": warning_codes,
        "errorCodes": error_codes,
        "thresholdValues": {
            "degenerate_face_area_epsilon": DEGENERATE_FACE_AREA_EPSILON,
            "high_triangle_count_threshold": HIGH_TRIANGLE_COUNT_THRESHOLD,
            "min_dimension_mm": MIN_DIMENSION_MM,
        },
        "measuredValues": {
            "face_count": face_count,
            "vertex_count": vertex_count,
            "degenerate_faces_count": degenerate_faces_count,
            "is_watertight": is_watertight,
            "is_winding_consistent": is_winding_consistent,
            "dimensions": dimensions,
        },
    }
