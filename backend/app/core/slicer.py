from __future__ import annotations

import numpy as np
from shapely.geometry import GeometryCollection, LineString, MultiPoint, MultiPolygon, Polygon
from shapely.ops import polygonize, unary_union

try:
    from shapely.validation import make_valid
except ImportError:  # pragma: no cover - Shapely 2.x is expected in this project.
    make_valid = None

from app.schemas.machining import MachiningParams


RECOMMENDED_MAX_LAYERS = 250


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

    merge_tolerance = max(1e-9, tolerance * 0.001)
    unique = []
    for point in points:
        if not any(np.linalg.norm(point - existing) <= merge_tolerance for existing in unique):
            unique.append(point)
    if len(unique) == 2 and np.linalg.norm(unique[0] - unique[1]) > merge_tolerance:
        return unique
    return None


def _iter_polygons(geometry):
    if geometry is None or geometry.is_empty:
        return
    if isinstance(geometry, Polygon):
        yield geometry
    elif isinstance(geometry, MultiPolygon):
        for polygon in geometry.geoms:
            if not polygon.is_empty and polygon.area > 0:
                yield polygon
    elif isinstance(geometry, GeometryCollection):
        for item in geometry.geoms:
            yield from _iter_polygons(item)


def _clean_ring_coords(coords, tolerance: float) -> list[tuple[float, float]] | None:
    cleaned = [(round(float(x), 6), round(float(y), 6)) for x, y in coords]
    if cleaned and cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    merge_tolerance = max(1e-9, tolerance * 0.001)
    unique = []
    for point in cleaned[:-1]:
        if not unique or abs(point[0] - unique[-1][0]) > merge_tolerance or abs(point[1] - unique[-1][1]) > merge_tolerance:
            unique.append(point)
    if len(unique) < 3:
        return None
    unique.append(unique[0])
    return unique


def _ring_key(coords: list[tuple[float, float]]) -> tuple[tuple[float, float], ...]:
    points = coords[:-1]
    if not points:
        return tuple()

    def rotate_to_min(items: list[tuple[float, float]]) -> tuple[tuple[float, float], ...]:
        min_index = min(range(len(items)), key=lambda index: items[index])
        rotated = items[min_index:] + items[:min_index]
        return tuple(rotated)

    forward = rotate_to_min(points)
    backward = rotate_to_min(list(reversed(points)))
    return min(forward, backward)


def _repair_geometry(geometry):
    if geometry is None or geometry.is_empty:
        return GeometryCollection(), False
    if geometry.is_valid:
        return geometry, False

    repaired = make_valid(geometry) if make_valid else geometry.buffer(0)
    polygons = list(_iter_polygons(repaired))
    if not polygons:
        return GeometryCollection(), True
    return unary_union(polygons), True


def _collect_unique_rings(polygons, tolerance: float) -> list[dict]:
    rings: dict[tuple[tuple[float, float], ...], dict] = {}
    for polygon in polygons:
        if polygon.area <= tolerance * tolerance:
            continue
        boundaries = [polygon.exterior, *polygon.interiors]
        for boundary in boundaries:
            coords = _clean_ring_coords(boundary.coords, tolerance)
            if not coords:
                continue
            ring_polygon = Polygon(coords)
            if ring_polygon.area <= tolerance * tolerance:
                continue
            key = _ring_key(coords)
            if key and key not in rings:
                rings[key] = {
                    "coords": coords,
                    "polygon": ring_polygon,
                    "area": float(ring_polygon.area),
                    "parent": None,
                    "depth": 0,
                }
    return list(rings.values())


def _ring_parent_index(rings: list[dict], ring_index: int) -> int | None:
    ring = rings[ring_index]
    point = ring["polygon"].representative_point()
    parent_index = None
    parent_area = float("inf")
    for candidate_index, candidate in enumerate(rings):
        if candidate_index == ring_index or candidate["area"] <= ring["area"]:
            continue
        if candidate["area"] >= parent_area:
            continue
        if candidate["polygon"].contains(point):
            parent_index = candidate_index
            parent_area = candidate["area"]
    return parent_index


def _assign_ring_depths(rings: list[dict]) -> None:
    for index in range(len(rings)):
        rings[index]["parent"] = _ring_parent_index(rings, index)

    def depth(index: int) -> int:
        parent = rings[index]["parent"]
        if parent is None:
            return 0
        return depth(parent) + 1

    for index in range(len(rings)):
        rings[index]["depth"] = depth(index)


def _geometry_from_rings(rings: list[dict], tolerance: float) -> dict:
    if not rings:
        return {
            "geometry": GeometryCollection(),
            "geometry_repair_used": False,
            "raw_hole_count": 0,
        }

    _assign_ring_depths(rings)
    raw_hole_count = sum(1 for ring in rings if ring["depth"] % 2 == 1)
    shell_polygons = []
    for index, ring in enumerate(rings):
        if ring["depth"] % 2 != 0:
            continue
        holes = [
            child["coords"]
            for child in rings
            if child["parent"] == index and child["depth"] == ring["depth"] + 1
        ]
        polygon = Polygon(ring["coords"], holes)
        if polygon.area > tolerance * tolerance:
            shell_polygons.append(polygon)

    if not shell_polygons:
        return {
            "geometry": GeometryCollection(),
            "geometry_repair_used": False,
            "raw_hole_count": raw_hole_count,
        }

    geometry = unary_union(shell_polygons)
    geometry, geometry_repair_used = _repair_geometry(geometry)
    return {
        "geometry": geometry,
        "geometry_repair_used": geometry_repair_used,
        "raw_hole_count": raw_hole_count,
    }


def _geometry_from_polygonized(polygons, tolerance: float) -> dict:
    rings = _collect_unique_rings(polygons, tolerance)
    return _geometry_from_rings(rings, tolerance)


def _boundary_contours(geometry) -> list[list[list[float]]]:
    contours: list[list[list[float]]] = []
    for polygon in _iter_polygons(geometry):
        exterior = [[round(float(x), 6), round(float(y), 6)] for x, y in polygon.exterior.coords]
        if len(exterior) >= 4:
            contours.append(exterior)
        for interior in polygon.interiors:
            hole = [[round(float(x), 6), round(float(y), 6)] for x, y in interior.coords]
            if len(hole) >= 4:
                contours.append(hole)
    return contours


def _polygon_payload(geometry) -> list[dict]:
    payload = []
    for polygon in _iter_polygons(geometry):
        payload.append(
            {
                "exterior": [[round(float(x), 6), round(float(y), 6)] for x, y in polygon.exterior.coords],
                "interiors": [
                    [[round(float(x), 6), round(float(y), 6)] for x, y in interior.coords]
                    for interior in polygon.interiors
                ],
            }
        )
    return payload


def _geometry_metadata(geometry) -> dict:
    polygons = list(_iter_polygons(geometry))
    hole_count = sum(len(polygon.interiors) for polygon in polygons)
    return {
        "has_holes": hole_count > 0,
        "hole_count": int(hole_count),
        "polygon_count": int(len(polygons)),
        "area_mm2": round(float(geometry.area), 6) if geometry is not None and not geometry.is_empty else 0.0,
    }


def _contours_at_z(
    triangles: np.ndarray,
    triangle_z_min: np.ndarray,
    triangle_z_max: np.ndarray,
    z: float,
    tolerance: float,
) -> dict:
    lines = []
    if len(triangles):
        candidate_triangles = triangles[(triangle_z_min <= z + tolerance) & (triangle_z_max >= z - tolerance)]
    else:
        candidate_triangles = triangles

    for triangle in candidate_triangles:
        segment = _triangle_plane_segment(triangle, z, tolerance)
        if segment:
            start = (round(float(segment[0][0]), 6), round(float(segment[0][1]), 6))
            end = (round(float(segment[1][0]), 6), round(float(segment[1][1]), 6))
            lines.append(LineString([start, end]))

    geometry_payload = _geometry_from_polygonized(polygonize(lines), tolerance)
    geometry = geometry_payload["geometry"]
    slicing_fallback_used = False
    convex_hull_fallback_used = False
    geometry_preservation_warning = False
    geometry_repair_used = bool(geometry_payload["geometry_repair_used"])
    raw_hole_count = int(geometry_payload["raw_hole_count"])

    if (geometry is None or geometry.is_empty) and lines:
        slicing_fallback_used = True
        geometry_payload = _geometry_from_polygonized(polygonize(unary_union(lines)), tolerance)
        geometry = geometry_payload["geometry"]
        geometry_repair_used = geometry_repair_used or bool(geometry_payload["geometry_repair_used"])
        raw_hole_count = max(raw_hole_count, int(geometry_payload["raw_hole_count"]))

    if (geometry is None or geometry.is_empty) and lines and raw_hole_count == 0:
        slicing_fallback_used = True
        convex_hull_fallback_used = True
        geometry_preservation_warning = True
        points = []
        for line in lines:
            points.extend(list(line.coords))
        hull = MultiPoint(points).convex_hull
        if hull.geom_type == "Polygon" and hull.area > tolerance * tolerance:
            geometry = hull

    if geometry is None:
        geometry = GeometryCollection()

    geometry, repair_after_fallback = _repair_geometry(geometry)
    geometry_repair_used = geometry_repair_used or repair_after_fallback
    metadata = _geometry_metadata(geometry)
    lost_holes_detected = bool(raw_hole_count > metadata["hole_count"])
    if lost_holes_detected:
        geometry_preservation_warning = True

    return {
        "geometry": geometry,
        "contours": _boundary_contours(geometry),
        "polygons": _polygon_payload(geometry),
        "slicing_fallback_used": slicing_fallback_used,
        "convex_hull_fallback_used": convex_hull_fallback_used,
        "geometry_preservation_warning": geometry_preservation_warning,
        "geometry_repair_used": geometry_repair_used,
        "lost_holes_detected": lost_holes_detected,
        **metadata,
    }


def slice_mesh(mesh, params: MachiningParams) -> dict:
    bounds = np.asarray(mesh.bounds, dtype=float)
    min_z = float(bounds[0][2])
    max_z = float(bounds[1][2])
    levels = _slice_levels(min_z, max_z, params.step_down_mm, params.tolerance_mm)
    layers: list[dict] = []
    warnings: list[str] = []
    layer_geometry_warnings: list[str] = []
    convex_hull_fallback_used = False
    slicing_fallback_used = False
    geometry_preservation_warning = False
    geometry_repair_used = False
    lost_holes_detected = False
    skipped_layers_count = 0
    total_holes_detected = 0
    triangles = np.asarray(mesh.triangles)
    triangle_z_min = triangles[:, :, 2].min(axis=1) if len(triangles) else np.array([])
    triangle_z_max = triangles[:, :, 2].max(axis=1) if len(triangles) else np.array([])

    if len(levels) > RECOMMENDED_MAX_LAYERS:
        warnings.append(
            f"step_down_mm={params.step_down_mm:.4f} genera {len(levels)} capas; "
            "el slicing y el toolpath pueden tardar mucho."
        )

    for index, z in enumerate(levels):
        section = _contours_at_z(triangles, triangle_z_min, triangle_z_max, z, params.tolerance_mm)
        contours = section["contours"]
        convex_hull_fallback_used = convex_hull_fallback_used or section["convex_hull_fallback_used"]
        slicing_fallback_used = slicing_fallback_used or section["slicing_fallback_used"]
        geometry_preservation_warning = geometry_preservation_warning or section["geometry_preservation_warning"]
        geometry_repair_used = geometry_repair_used or section["geometry_repair_used"]
        lost_holes_detected = lost_holes_detected or section["lost_holes_detected"]
        total_holes_detected += int(section["hole_count"])

        if not contours:
            warnings.append(f"La capa Z={z:.3f} mm produjo secciones abiertas o vacías.")
            skipped_layers_count += 1
            continue
        if section["convex_hull_fallback_used"]:
            message = (
                f"La capa Z={z:.3f} mm usó convex hull fallback; "
                "la geometría original puede no preservarse."
            )
            warnings.append(message)
            layer_geometry_warnings.append("CONVEX_HULL_FALLBACK_USED")
        if section["geometry_repair_used"]:
            layer_geometry_warnings.append("GEOMETRY_REPAIR_USED")
        if section["lost_holes_detected"]:
            message = f"La capa Z={z:.3f} mm perdió huecos internos durante la reconstrucción geométrica."
            warnings.append(message)
            layer_geometry_warnings.append("LOST_HOLES_DETECTED")

        machine_z = z - max_z
        layer = {
            "index": index,
            "modelZ": round(z, 6),
            "machineZ": round(machine_z, 6),
            "geometry": section["geometry"],
            "contours": contours,
            "polygons": section["polygons"],
            "has_holes": section["has_holes"],
            "hole_count": section["hole_count"],
            "polygon_count": section["polygon_count"],
            "area_mm2": section["area_mm2"],
            "convex_hull_fallback_used": section["convex_hull_fallback_used"],
            "geometry_repair_used": section["geometry_repair_used"],
            "lost_holes_detected": section["lost_holes_detected"],
            "slicingFallbackUsed": section["slicing_fallback_used"],
            "convexHullFallbackUsed": section["convex_hull_fallback_used"],
            "geometryPreservationWarning": section["geometry_preservation_warning"],
            "hasHoles": section["has_holes"],
            "holeCount": section["hole_count"],
            "polygonCount": section["polygon_count"],
            "geometryRepairUsed": section["geometry_repair_used"],
            "lostHolesDetected": section["lost_holes_detected"],
        }
        layers.append(layer)

    unique_layer_geometry_warnings = list(dict.fromkeys(layer_geometry_warnings))
    return {
        "layers": layers,
        "warnings": warnings,
        "layerGeometryWarnings": unique_layer_geometry_warnings,
        "layer_geometry_warnings": unique_layer_geometry_warnings,
        "convexHullFallbackUsed": convex_hull_fallback_used,
        "convex_hull_fallback_used": convex_hull_fallback_used,
        "slicingFallbackUsed": slicing_fallback_used,
        "slicing_fallback_used": slicing_fallback_used,
        "geometryPreservationWarning": geometry_preservation_warning,
        "geometry_preservation_warning": geometry_preservation_warning,
        "geometryRepairUsed": geometry_repair_used,
        "geometry_repair_used": geometry_repair_used,
        "lostHolesDetected": lost_holes_detected,
        "lost_holes_detected": lost_holes_detected,
        "totalHolesDetected": total_holes_detected,
        "total_holes_detected": total_holes_detected,
        "skippedLayersCount": skipped_layers_count,
        "estimatedLayerCount": len(levels),
        "recommendedMaxLayers": RECOMMENDED_MAX_LAYERS,
        "modelBounds": {"min": bounds[0].tolist(), "max": bounds[1].tolist()},
        "coordinateConvention": {
            "units": "mm",
            "machineZZero": "superficie superior del stock/modelo",
            "modelBaseZ": 0.0,
            "machineCuts": "Z negativo desde la superficie superior",
        },
    }
