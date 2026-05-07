import numpy as np


def _convexity_ratio(mesh) -> float:
    mesh_volume = float(abs(mesh.volume))
    try:
        hull_volume = float(mesh.convex_hull.volume)
        if hull_volume <= 0:
            raise ValueError("Convex hull sin volumen útil.")
        return max(0.0, min(1.0, mesh_volume / hull_volume))
    except Exception:
        bounds = np.asarray(mesh.bounds, dtype=float)
        bbox_size = bounds[1] - bounds[0]
        bbox_volume = float(np.prod(bbox_size))
        if bbox_volume > 0:
            return max(0.0, min(1.0, mesh_volume / bbox_volume))
        return 0.0


def _vertical_intersection_stats(mesh, grid_size: int = 12) -> dict:
    """Sample vertical XY columns and count unique Z intersections.

    A top-down 3-axis router can machine concavities visible from +Z, but repeated
    vertical intervals in many columns are a useful warning sign for hidden zones
    or undercuts. This is a heuristic for thesis-prototype validation, not a full
    visibility solver.
    """

    bounds = np.asarray(mesh.bounds, dtype=float)
    mins, maxs = bounds
    xs = np.linspace(mins[0], maxs[0], grid_size + 2)[1:-1]
    ys = np.linspace(mins[1], maxs[1], grid_size + 2)[1:-1]
    triangles = np.asarray(mesh.triangles)
    complex_columns = 0
    sampled_columns = 0

    for x in xs:
        for y in ys:
            z_hits: list[float] = []
            p = np.array([x, y])
            for tri in triangles:
                tri_xy = tri[:, :2]
                v0 = tri_xy[1] - tri_xy[0]
                v1 = tri_xy[2] - tri_xy[0]
                v2 = p - tri_xy[0]
                den = v0[0] * v1[1] - v1[0] * v0[1]
                if abs(den) < 1e-12:
                    continue
                a = (v2[0] * v1[1] - v1[0] * v2[1]) / den
                b = (v0[0] * v2[1] - v2[0] * v0[1]) / den
                c = 1.0 - a - b
                if a >= -1e-8 and b >= -1e-8 and c >= -1e-8:
                    z_hits.append(float(c * tri[0, 2] + a * tri[1, 2] + b * tri[2, 2]))

            if not z_hits:
                continue

            sampled_columns += 1
            unique_hits = np.unique(np.round(z_hits, decimals=3))
            if len(unique_hits) > 2:
                complex_columns += 1

    ratio = complex_columns / sampled_columns if sampled_columns else 0.0
    return {
        "sampledColumns": sampled_columns,
        "complexColumns": complex_columns,
        "complexColumnRatio": ratio,
    }


def analyze_machinability(mesh, validation: dict | None = None) -> dict:
    warnings: list[str] = []
    errors: list[str] = []
    validation = validation or {}

    if validation and not validation.get("isValid", False):
        errors.append("La malla tiene errores geométricos que impiden evaluar fabricabilidad.")

    bounds = np.asarray(mesh.bounds, dtype=float)
    min_z = float(bounds[0][2])
    height = float(bounds[1][2] - bounds[0][2])
    area_faces = np.asarray(mesh.area_faces)
    total_area = float(area_faces.sum()) or 1.0
    normals = np.asarray(mesh.face_normals)
    centers = np.asarray(mesh.triangles).mean(axis=1)

    near_base = np.abs(centers[:, 2] - min_z) <= max(0.05, height * 0.01)
    downward = normals[:, 2] < -0.25
    underside_not_base = downward & ~near_base
    underside_area_ratio = float(area_faces[underside_not_base].sum() / total_area)

    base_area = float(area_faces[near_base & downward].sum())
    footprint_area = max(
        1e-9,
        float((bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1])),
    )
    base_flatness_score = max(0.0, min(1.0, base_area / footprint_area))

    convexity_ratio = _convexity_ratio(mesh)
    is_likely_convex = convexity_ratio >= 0.98

    intersection_stats = _vertical_intersection_stats(mesh)
    complex_ratio = float(intersection_stats["complexColumnRatio"])
    has_potential_undercuts = underside_area_ratio > 0.02 or complex_ratio > 0.08

    if not validation.get("isWatertight", False):
        warnings.append(
            "La malla no es cerrada; se permite el análisis, pero la compatibilidad 3 ejes es menos confiable."
        )
    if underside_area_ratio > 0.02:
        warnings.append(
            "Se detectaron superficies descendentes fuera de la base; podrían representar socavados no accesibles desde Z."
        )
    if complex_ratio > 0.08:
        warnings.append(
            "Varias columnas verticales presentan múltiples intersecciones; revisar cavidades internas o zonas ocultas."
        )
    if base_flatness_score < 0.1:
        warnings.append("No se encontró una base plana clara en Z mínimo.")
    concavity_detected = not is_likely_convex
    if concavity_detected and underside_area_ratio <= 0.02 and complex_ratio <= 0.08:
        warnings.append(
            "La geometría no es estrictamente convexa, pero parece accesible desde Z; la precisión dependerá de la herramienta configurada."
        )

    accessibility_score = max(0.0, min(1.0, 1.0 - (underside_area_ratio * 3.0 + complex_ratio * 2.0)))
    is_three_axis_machinable = not errors and not has_potential_undercuts and accessibility_score >= 0.7

    explanation = (
        "El modelo parece compatible con mecanizado CNC router de 3 ejes bajo las reglas simplificadas del sistema."
        if is_three_axis_machinable
        else "No se considera compatible con mecanizado CNC de 3 ejes bajo las heurísticas simplificadas del sistema."
    )
    if not has_potential_undercuts and not is_likely_convex:
        explanation += " La geometría puede ser cóncava, pero no se detectaron socavados evidentes."

    return {
        "isThreeAxisMachinable": bool(is_three_axis_machinable),
        "isLikelyConvex": bool(is_likely_convex),
        "hasPotentialUndercuts": bool(has_potential_undercuts),
        "accessibilityScore": round(accessibility_score, 4),
        "baseFlatnessScore": round(base_flatness_score, 4),
        "warnings": warnings,
        "errors": errors,
        "explanation": explanation,
        "details": {
            "convexityRatio": round(convexity_ratio, 4),
            "concavityDetected": bool(concavity_detected),
            "undersideAreaRatio": round(underside_area_ratio, 4),
            **intersection_stats,
        },
    }
