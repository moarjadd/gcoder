import numpy as np


CONVEXITY_RATIO_THRESHOLD = 0.98
UNDERSIDE_AREA_RATIO_THRESHOLD = 0.02
COMPLEX_COLUMN_RATIO_THRESHOLD = 0.08
BASE_FLATNESS_WARNING_THRESHOLD = 0.1
ACCESSIBILITY_SCORE_THRESHOLD = 0.7
VERTICAL_GRID_SIZE = 12


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


def _append_warning(warnings: list[str], warning_codes: list[str], code: str, message: str) -> None:
    warnings.append(message)
    warning_codes.append(code)


def analyze_machinability(mesh, validation: dict | None = None) -> dict:
    warnings: list[str] = []
    errors: list[str] = []
    warning_codes: list[str] = []
    error_codes: list[str] = []
    validation = validation or {}

    if validation and not validation.get("isValid", False):
        errors.append("La malla tiene errores geométricos que impiden evaluar fabricabilidad.")
        error_codes.append("validation_errors_present")

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
    is_likely_convex = convexity_ratio >= CONVEXITY_RATIO_THRESHOLD

    intersection_stats = _vertical_intersection_stats(mesh, grid_size=VERTICAL_GRID_SIZE)
    complex_ratio = float(intersection_stats["complexColumnRatio"])
    has_potential_undercuts = (
        underside_area_ratio > UNDERSIDE_AREA_RATIO_THRESHOLD
        or complex_ratio > COMPLEX_COLUMN_RATIO_THRESHOLD
    )

    if not validation.get("isWatertight", False):
        _append_warning(
            warnings,
            warning_codes,
            "not_watertight",
            "La malla no es cerrada; se permite el análisis, pero la compatibilidad 3 ejes es menos confiable."
        )
    if underside_area_ratio > UNDERSIDE_AREA_RATIO_THRESHOLD:
        _append_warning(
            warnings,
            warning_codes,
            "underside_area_ratio_above_threshold",
            "Se detectaron superficies descendentes fuera de la base; podrían representar socavados no accesibles desde Z."
        )
    if complex_ratio > COMPLEX_COLUMN_RATIO_THRESHOLD:
        _append_warning(
            warnings,
            warning_codes,
            "complex_column_ratio_above_threshold",
            "Varias columnas verticales presentan múltiples intersecciones; revisar cavidades internas o zonas ocultas."
        )
    if base_flatness_score < BASE_FLATNESS_WARNING_THRESHOLD:
        _append_warning(warnings, warning_codes, "base_flatness_below_threshold", "No se encontró una base plana clara en Z mínimo.")
    concavity_detected = not is_likely_convex
    if concavity_detected:
        warning_codes.append("convexity_ratio_below_threshold")
    if (
        concavity_detected
        and underside_area_ratio <= UNDERSIDE_AREA_RATIO_THRESHOLD
        and complex_ratio <= COMPLEX_COLUMN_RATIO_THRESHOLD
    ):
        _append_warning(
            warnings,
            warning_codes,
            "concavity_detected_accessible",
            "La geometría no es estrictamente convexa, pero parece accesible desde Z; la precisión dependerá de la herramienta configurada."
        )

    accessibility_score = max(0.0, min(1.0, 1.0 - (underside_area_ratio * 3.0 + complex_ratio * 2.0)))
    if accessibility_score < ACCESSIBILITY_SCORE_THRESHOLD:
        warning_codes.append("accessibility_score_below_threshold")
    is_three_axis_machinable = (
        not errors
        and not has_potential_undercuts
        and accessibility_score >= ACCESSIBILITY_SCORE_THRESHOLD
    )

    explanation = (
        "El modelo parece compatible con mecanizado CNC router de 3 ejes bajo las reglas simplificadas del sistema."
        if is_three_axis_machinable
        else "No se considera compatible con mecanizado CNC de 3 ejes bajo las heurísticas simplificadas del sistema."
    )
    if not has_potential_undercuts and not is_likely_convex:
        explanation += " La geometría puede ser cóncava, pero no se detectaron socavados evidentes."

    threshold_values = {
        "convexity_ratio_threshold": CONVEXITY_RATIO_THRESHOLD,
        "underside_area_ratio_threshold": UNDERSIDE_AREA_RATIO_THRESHOLD,
        "complex_column_ratio_threshold": COMPLEX_COLUMN_RATIO_THRESHOLD,
        "base_flatness_warning_threshold": BASE_FLATNESS_WARNING_THRESHOLD,
        "accessibility_score_threshold": ACCESSIBILITY_SCORE_THRESHOLD,
    }
    measured_values = {
        "convexity_ratio": round(convexity_ratio, 4),
        "concavity_detected": bool(concavity_detected),
        "underside_area_ratio": round(underside_area_ratio, 4),
        "complex_column_ratio": round(complex_ratio, 4),
        "base_flatness_score": round(base_flatness_score, 4),
        "accessibility_score": round(accessibility_score, 4),
        "sampled_columns": int(intersection_stats["sampledColumns"]),
        "complex_columns": int(intersection_stats["complexColumns"]),
        "is_watertight": bool(validation.get("isWatertight", False)),
        "is_winding_consistent": bool(validation.get("isWindingConsistent", False)),
    }

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
        "warningCodes": list(dict.fromkeys(warning_codes)),
        "errorCodes": error_codes,
        "thresholdValues": threshold_values,
        "measuredValues": measured_values,
        "debug": {
            "verticalGridSize": VERTICAL_GRID_SIZE,
            "validationIsValid": bool(validation.get("isValid", True)),
        },
    }
