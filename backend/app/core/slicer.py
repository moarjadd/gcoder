import numpy as np
from shapely.geometry import LineString, MultiPoint
from shapely.ops import polygonize, unary_union

from app.schemas.machining import MachiningParams


def _slice_levels(min_z: float, max_z: float, step_down: float, tolerance: float) -> list[float]:
    height = max_z - min_z
    if height <= tolerance:
        return []
    levels: list[float] = []
    z = max_z - step_down
    floor = min_z + max(tolerance * 10.0, step_down * 0.5)
    while z >= floor:
        levels.append(float(z))
        z -= step_down
    if not levels or levels[-1] > floor + tolerance:
        levels.append(float(floor))
    return levels


def _triangle_plane_segment(triangle: np.ndarray, z: float, tolerance: float):
    points = []
    for start, end in ((0, 1), (1, 2), (2, 0)):
        p0 = triangle[start]
        p1 = triangle[end]
        d0 = p0[2] - z
        d1 = p1[2] - z
        if abs(d0) <= tolerance and abs(d1) <= tolerance:
            continue
        if abs(d0) <= tolerance:
            points.append(p0[:2])
        if d0 * d1 < 0:
            t = d0 / (d0 - d1)
            points.append((p0 + t * (p1 - p0))[:2])
        if abs(d1) <= tolerance:
            points.append(p1[:2])

    unique = []
    for point in points:
        if not any(np.linalg.norm(point - existing) <= tolerance for existing in unique):
            unique.append(point)
    if len(unique) == 2 and np.linalg.norm(unique[0] - unique[1]) > tolerance:
        return unique
    return None


def _polygon_contours(polygons, tolerance: float) -> list[list[list[float]]]:
    contours: list[list[list[float]]] = []
    for polygon in polygons:
        if polygon.area <= tolerance * tolerance:
            continue
        exterior = [[round(float(x), 6), round(float(y), 6)] for x, y in polygon.exterior.coords]
        if len(exterior) >= 4:
            contours.append(exterior)
        for interior in polygon.interiors:
            hole = [[round(float(x), 6), round(float(y), 6)] for x, y in interior.coords]
            if len(hole) >= 4:
                contours.append(hole)
    return contours


def _contours_at_z(mesh, z: float, tolerance: float) -> dict:
    lines = []
    for triangle in np.asarray(mesh.triangles):
        segment = _triangle_plane_segment(triangle, z, tolerance)
        if segment:
            start = (round(float(segment[0][0]), 6), round(float(segment[0][1]), 6))
            end = (round(float(segment[1][0]), 6), round(float(segment[1][1]), 6))
            lines.append(LineString([start, end]))

    contours = _polygon_contours(polygonize(lines), tolerance)
    slicing_fallback_used = False
    convex_hull_fallback_used = False
    geometry_preservation_warning = False

    if not contours and lines:
        slicing_fallback_used = True
        contours = _polygon_contours(polygonize(unary_union(lines)), tolerance)

    if not contours and lines:
        slicing_fallback_used = True
        convex_hull_fallback_used = True
        geometry_preservation_warning = True
        points = []
        for line in lines:
            points.extend(list(line.coords))
        hull = MultiPoint(points).convex_hull
        if hull.geom_type == "Polygon" and hull.area > tolerance * tolerance:
            contours.append([[round(float(x), 6), round(float(y), 6)] for x, y in hull.exterior.coords])

    return {
        "contours": contours,
        "slicing_fallback_used": slicing_fallback_used,
        "convex_hull_fallback_used": convex_hull_fallback_used,
        "geometry_preservation_warning": geometry_preservation_warning,
    }


def slice_mesh(mesh, params: MachiningParams) -> dict:
    bounds = np.asarray(mesh.bounds, dtype=float)
    min_z = float(bounds[0][2])
    max_z = float(bounds[1][2])
    levels = _slice_levels(min_z, max_z, params.step_down_mm, params.tolerance_mm)
    layers: list[dict] = []
    warnings: list[str] = []
    convex_hull_fallback_used = False
    slicing_fallback_used = False
    geometry_preservation_warning = False
    skipped_layers_count = 0

    for index, z in enumerate(levels):
        section = _contours_at_z(mesh, z, params.tolerance_mm)
        contours = section["contours"]
        convex_hull_fallback_used = convex_hull_fallback_used or section["convex_hull_fallback_used"]
        slicing_fallback_used = slicing_fallback_used or section["slicing_fallback_used"]
        geometry_preservation_warning = geometry_preservation_warning or section["geometry_preservation_warning"]

        if not contours:
            warnings.append(f"La capa Z={z:.3f} mm produjo secciones abiertas o vacías.")
            skipped_layers_count += 1
            continue
        if section["convex_hull_fallback_used"]:
            warnings.append(
                f"La capa Z={z:.3f} mm usó convex hull fallback; la geometría original puede no preservarse."
            )

        machine_z = z - max_z
        layers.append(
            {
                "index": index,
                "modelZ": round(z, 6),
                "machineZ": round(machine_z, 6),
                "contours": contours,
                "slicingFallbackUsed": section["slicing_fallback_used"],
                "convexHullFallbackUsed": section["convex_hull_fallback_used"],
                "geometryPreservationWarning": section["geometry_preservation_warning"],
            }
        )

    return {
        "layers": layers,
        "warnings": warnings,
        "convexHullFallbackUsed": convex_hull_fallback_used,
        "slicingFallbackUsed": slicing_fallback_used,
        "geometryPreservationWarning": geometry_preservation_warning,
        "skippedLayersCount": skipped_layers_count,
        "modelBounds": {"min": bounds[0].tolist(), "max": bounds[1].tolist()},
        "coordinateConvention": {
            "units": "mm",
            "machineZZero": "superficie superior del stock/modelo",
            "modelBaseZ": 0.0,
            "machineCuts": "Z negativo desde la superficie superior",
        },
    }
