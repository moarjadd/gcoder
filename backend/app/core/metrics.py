import math
import time
from typing import Any

from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon


def now_seconds() -> float:
    return time.perf_counter()


def elapsed_ms(start_time: float) -> float:
    return round((time.perf_counter() - start_time) * 1000.0, 3)


def format_duration_ms(duration_ms: float) -> str:
    total_centiseconds = int(round(max(0.0, duration_ms) / 10.0))
    minutes, centiseconds = divmod(total_centiseconds, 60 * 100)
    seconds = centiseconds / 100.0
    return f"{minutes} min {seconds:05.2f} s"


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


def _iter_lines(geometry):
    if geometry is None or geometry.is_empty:
        return
    if isinstance(geometry, LineString):
        yield geometry
    elif isinstance(geometry, MultiLineString):
        for line in geometry.geoms:
            if not line.is_empty and line.length > 0:
                yield line
    elif isinstance(geometry, GeometryCollection):
        for item in geometry.geoms:
            yield from _iter_lines(item)


def _boundary_lines(geometry) -> list[LineString]:
    lines: list[LineString] = []
    for polygon in _iter_polygons(geometry):
        lines.extend(line for line in _iter_lines(polygon.boundary))
    return lines


def _sample_line_distances(line: LineString, spacing_mm: float, max_points: int = 160):
    if line.length <= 0:
        return
    points_count = max(2, int(math.ceil(line.length / max(spacing_mm, 1e-6))) + 1)
    points_count = min(points_count, max_points)
    if points_count == 1:
        yield line.interpolate(0.0)
        return
    for index in range(points_count):
        distance = line.length * index / (points_count - 1)
        yield line.interpolate(distance)


def _hole_polygons(geometry, tolerance_mm: float) -> list[Polygon]:
    holes: list[Polygon] = []
    for polygon in _iter_polygons(geometry):
        for interior in polygon.interiors:
            hole = Polygon(interior)
            if hole.is_valid and hole.area > tolerance_mm * tolerance_mm:
                holes.append(hole)
    return holes


def _count_preserved_holes(target_geometry, nominal_geometry, tolerance_mm: float) -> int:
    target_holes = _hole_polygons(target_geometry, tolerance_mm)
    nominal_holes = _hole_polygons(nominal_geometry, tolerance_mm)
    preserved = 0
    for target_hole in target_holes:
        if any(
            target_hole.intersection(candidate).area / max(target_hole.area, tolerance_mm * tolerance_mm) >= 0.5
            for candidate in nominal_holes
        ):
            preserved += 1
    return preserved


def compute_layer_precision_metrics(
    precision_layers: list[dict] | None,
    tolerance_mm: float = 0.1,
    sampling_step_mm: float = 1.0,
) -> dict[str, Any]:
    precision_layers = precision_layers or []
    errors: list[float] = []
    compared_layers = 0
    skipped_layers = 0
    target_area_total = 0.0
    area_error_total = 0.0
    total_holes_detected = 0
    total_holes_preserved = 0
    layer_geometry_warnings: list[str] = []

    for layer in precision_layers:
        target_geometry = layer.get("target_geometry")
        nominal_geometry = layer.get("nominal_geometry")
        if target_geometry is None or nominal_geometry is None or target_geometry.is_empty or nominal_geometry.is_empty:
            skipped_layers += 1
            layer_geometry_warnings.append("PRECISION_LAYER_WITHOUT_COMPARABLE_GEOMETRY")
            continue

        target_lines = _boundary_lines(target_geometry)
        nominal_lines = _boundary_lines(nominal_geometry)
        if not target_lines or not nominal_lines:
            skipped_layers += 1
            layer_geometry_warnings.append("PRECISION_LAYER_WITHOUT_BOUNDARIES")
            continue

        target_boundary = target_geometry.boundary
        nominal_boundary = nominal_geometry.boundary
        for line in target_lines:
            errors.extend(point.distance(nominal_boundary) for point in _sample_line_distances(line, sampling_step_mm))
        for line in nominal_lines:
            errors.extend(point.distance(target_boundary) for point in _sample_line_distances(line, sampling_step_mm))

        compared_layers += 1
        target_area_total += float(target_geometry.area)
        area_error_total += abs(float(target_geometry.area) - float(nominal_geometry.area))
        layer_target_holes = len(_hole_polygons(target_geometry, tolerance_mm))
        total_holes_detected += layer_target_holes
        total_holes_preserved += _count_preserved_holes(target_geometry, nominal_geometry, tolerance_mm)

        if layer.get("convex_hull_fallback_used"):
            layer_geometry_warnings.append("CONVEX_HULL_FALLBACK_USED")
        if layer.get("geometry_repair_used"):
            layer_geometry_warnings.append("GEOMETRY_REPAIR_USED")
        if layer.get("lost_holes_detected"):
            layer_geometry_warnings.append("LOST_HOLES_DETECTED")

    hole_preservation_rate = (
        total_holes_preserved / total_holes_detected
        if total_holes_detected
        else 1.0
    )
    if total_holes_detected and hole_preservation_rate < 1.0:
        layer_geometry_warnings.append("HOLE_PRESERVATION_INCOMPLETE")

    if not errors:
        layer_geometry_warnings.append("DIMENSIONAL_PRECISION_NOT_COMPUTED")
        return {
            "rmse_mm": None,
            "max_error_mm": None,
            "mean_error_mm": None,
            "area_error_percent": None,
            "compared_layers": compared_layers,
            "skipped_layers": skipped_layers,
            "hole_preservation_rate": hole_preservation_rate,
            "total_holes_detected": int(total_holes_detected),
            "total_holes_preserved": int(total_holes_preserved),
            "layer_geometry_warnings": list(dict.fromkeys(layer_geometry_warnings)),
            "rmse_note": (
                "RMSE no calculado: no existen capas con geometría objetivo y nominal comparable."
            ),
        }

    mean_square = sum(error * error for error in errors) / len(errors)
    mean_error = sum(errors) / len(errors)
    area_error_percent = (
        (area_error_total / target_area_total) * 100.0
        if target_area_total > 0
        else None
    )
    return {
        "rmse_mm": round(math.sqrt(mean_square), 6),
        "max_error_mm": round(max(errors), 6),
        "mean_error_mm": round(mean_error, 6),
        "area_error_percent": round(area_error_percent, 6) if area_error_percent is not None else None,
        "compared_layers": compared_layers,
        "skipped_layers": skipped_layers,
        "hole_preservation_rate": round(hole_preservation_rate, 6),
        "total_holes_detected": int(total_holes_detected),
        "total_holes_preserved": int(total_holes_preserved),
        "layer_geometry_warnings": list(dict.fromkeys(layer_geometry_warnings)),
        "rmse_note": (
            "RMSE aproximado 2.5D calculado por comparación de contornos de capa "
            "contra geometría nominal compensada por radio de herramienta; no sustituye simulación física de remoción."
        ),
    }


def compute_metrics(
    start_time: float,
    moves: list[dict],
    gcode: str,
    layers_count: int,
    warnings: list[str],
    anomalies: list[str],
    precision_layers: list[dict] | None = None,
    tolerance_mm: float = 0.1,
) -> dict[str, Any]:
    xs = [move["x"] for move in moves if "x" in move]
    ys = [move["y"] for move in moves if "y" in move]
    zs = [move["z"] for move in moves if "z" in move]

    path_length = 0.0
    current = {"x": None, "y": None, "z": None}
    for move in moves:
        next_pos = current.copy()
        for axis in ("x", "y", "z"):
            if axis in move:
                next_pos[axis] = move[axis]
        if all(current[axis] is not None and next_pos[axis] is not None for axis in ("x", "y", "z")):
            path_length += math.dist(
                [current["x"], current["y"], current["z"]],
                [next_pos["x"], next_pos["y"], next_pos["z"]],
            )
        current = next_pos

    precision_metrics = compute_layer_precision_metrics(precision_layers, tolerance_mm=tolerance_mm)

    return {
        "processing_time_seconds": round(time.perf_counter() - start_time, 4),
        "layer_count": layers_count,
        "toolpath_move_count": len(moves),
        "gcode_line_count": len(gcode.splitlines()),
        "path_bounds": {
            "min": [min(xs) if xs else None, min(ys) if ys else None, min(zs) if zs else None],
            "max": [max(xs) if xs else None, max(ys) if ys else None, max(zs) if zs else None],
        },
        "estimated_path_length_mm": round(path_length, 3),
        "warnings_count": len(warnings),
        "anomalies_count": len(anomalies),
        **precision_metrics,
    }
