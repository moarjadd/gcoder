from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon, box
from shapely.ops import unary_union

from app.core.geometry import transform_xy_to_work_origin
from app.core.units import clean_mm
from app.schemas.machining import MachiningParams, ToolpathStrategy


@dataclass
class ToolpathResult:
    moves: list[dict]
    warnings: list[str]
    anomalies: list[str]
    bounds: dict
    machining_semantics: str
    uses_internal_pocket: bool
    stock_margin_mm: float
    tool_radius_mm: float
    convex_hull_fallback_used: bool
    slicing_fallback_used: bool
    geometry_preservation_warning: bool
    concavity_detected: bool
    concavity_preserved: bool
    detail_loss_risk: bool
    skipped_layers_count: int
    invalid_toolpath_layers_count: int


def _clean_number(value: float) -> float:
    return clean_mm(value)


def _polygon_from_contour(contour: list[list[float]], tolerance: float) -> Polygon | None:
    if len(contour) < 4:
        return None
    polygon = Polygon(contour)
    if polygon.area <= tolerance * tolerance:
        return None
    if not polygon.is_valid:
        polygon = polygon.buffer(0)
    if polygon.is_empty or not isinstance(polygon, Polygon):
        return None
    return polygon


def _iter_polygons(geometry) -> Iterable[Polygon]:
    if geometry.is_empty:
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


def _contours_from_polygon(polygon: Polygon) -> list[list[tuple[float, float]]]:
    contours = [list(polygon.exterior.coords)]
    contours.extend(list(interior.coords) for interior in polygon.interiors)
    return contours


def _rapid(moves: list[dict], x: float | None = None, y: float | None = None, z: float | None = None, comment: str | None = None):
    move = {"kind": "rapid"}
    if x is not None:
        move["x"] = _clean_number(x)
    if y is not None:
        move["y"] = _clean_number(y)
    if z is not None:
        move["z"] = _clean_number(z)
    if comment:
        move["comment"] = comment
    moves.append(move)


def _linear(
    moves: list[dict],
    x: float | None = None,
    y: float | None = None,
    z: float | None = None,
    feed: float | None = None,
    comment: str | None = None,
):
    move = {"kind": "linear"}
    if x is not None:
        move["x"] = _clean_number(x)
    if y is not None:
        move["y"] = _clean_number(y)
    if z is not None:
        move["z"] = _clean_number(z)
    if feed is not None:
        move["feed"] = float(feed)
    if comment:
        move["comment"] = comment
    moves.append(move)


def _transform_point(x: float, y: float, model_bounds: dict, params: MachiningParams) -> tuple[float, float]:
    return transform_xy_to_work_origin(x, y, model_bounds, params)


def _add_contour_moves(moves: list[dict], contour: list[tuple[float, float]], z: float, model_bounds: dict, params: MachiningParams):
    if len(contour) < 2:
        return
    first_x, first_y = _transform_point(contour[0][0], contour[0][1], model_bounds, params)
    _rapid(moves, z=params.safe_z_mm, comment="Subir a Z seguro antes de traslado XY")
    _rapid(moves, x=first_x, y=first_y)
    _linear(moves, z=z, feed=params.plunge_rate_mm_min, comment="Entrada vertical controlada")
    for x, y in contour[1:]:
        tx, ty = _transform_point(x, y, model_bounds, params)
        _linear(moves, x=tx, y=ty, feed=params.feed_rate_mm_min)
    _rapid(moves, z=params.safe_z_mm)


def _offset_geometry(polygon: Polygon, distance: float):
    if abs(distance) < 1e-9:
        return polygon
    return polygon.buffer(distance, join_style=2, mitre_limit=2.0)


def _build_layer_geometry(contours: list[list[list[float]]], params: MachiningParams):
    polygons = [_polygon_from_contour(contour, params.tolerance_mm) for contour in contours]
    polygons = [polygon for polygon in polygons if polygon is not None]
    if not polygons:
        return None
    return unary_union(polygons)


def _is_concave(geometry, tolerance: float) -> bool:
    if geometry is None or geometry.is_empty:
        return False
    hull = geometry.convex_hull
    if hull.is_empty or hull.area <= tolerance * tolerance:
        return False
    return (hull.area - geometry.area) / hull.area > 0.02


def _detail_loss_risk(geometry, tool_radius: float, tolerance: float) -> bool:
    if geometry is None or geometry.is_empty or geometry.area <= tolerance * tolerance:
        return False
    edge_lengths: list[float] = []
    for polygon in _iter_polygons(geometry):
        coords = list(polygon.exterior.coords)
        for start, end in zip(coords, coords[1:]):
            length = LineString([start, end]).length
            if length > tolerance:
                edge_lengths.append(length)
    if edge_lengths:
        characteristic_edge = sorted(edge_lengths)[len(edge_lengths) // 2]
        if tool_radius > characteristic_edge * 0.75:
            return True

    restored = geometry.buffer(tool_radius, join_style=2, mitre_limit=2.0).buffer(
        -tool_radius,
        join_style=2,
        mitre_limit=2.0,
    )
    if restored.is_empty:
        return True
    changed_area = restored.symmetric_difference(geometry).area
    return changed_area / max(geometry.area, tolerance * tolerance) > 0.01


def _stock_polygon(model_bounds: dict, stock_margin: float) -> Polygon:
    mins = model_bounds["min"]
    maxs = model_bounds["max"]
    return box(
        float(mins[0]) - stock_margin,
        float(mins[1]) - stock_margin,
        float(maxs[0]) + stock_margin,
        float(maxs[1]) + stock_margin,
    )


def _zigzag_segments(polygon: Polygon, params: MachiningParams):
    minx, miny, maxx, maxy = polygon.bounds
    y = miny
    reverse = False
    while y <= maxy:
        line = LineString([(minx - 1.0, y), (maxx + 1.0, y)])
        clipped = polygon.intersection(line)
        segments = []
        if isinstance(clipped, LineString):
            segments = [clipped]
        elif isinstance(clipped, MultiLineString):
            segments = list(clipped.geoms)
        for segment in segments:
            coords = list(segment.coords)
            if len(coords) >= 2:
                yield list(reversed(coords)) if reverse else coords
                reverse = not reverse
        y += params.step_over_mm


def _add_geometry_contour_moves(moves: list[dict], geometry, z: float, model_bounds: dict, params: MachiningParams) -> int:
    added = 0
    for polygon in _iter_polygons(geometry):
        for contour in _contours_from_polygon(polygon):
            _add_contour_moves(moves, contour, z, model_bounds, params)
            added += 1
    return added


def _add_positive_part_external_moves(
    moves: list[dict],
    piece_geometry,
    stock: Polygon,
    z: float,
    model_bounds: dict,
    params: MachiningParams,
    tool_radius: float,
) -> int:
    piece_keepout = piece_geometry.buffer(tool_radius, join_style=2, mitre_limit=2.0)
    stock_inside = stock.buffer(-tool_radius, join_style=2, mitre_limit=2.0)
    if stock_inside.is_empty:
        return 0

    allowed_geometry = stock_inside.difference(piece_keepout)
    if not allowed_geometry.is_valid:
        allowed_geometry = allowed_geometry.buffer(0)
    if allowed_geometry.is_empty or allowed_geometry.area <= params.tolerance_mm * params.tolerance_mm:
        return 0

    added = 0
    current_geometry = allowed_geometry
    while not current_geometry.is_empty and current_geometry.area > params.tolerance_mm * params.tolerance_mm:
        added += _add_geometry_contour_moves(moves, current_geometry, z, model_bounds, params)
        current_geometry = current_geometry.buffer(-params.step_over_mm, join_style=2, mitre_limit=2.0)
        if not current_geometry.is_valid:
            current_geometry = current_geometry.buffer(0)
    return added


def _add_internal_pocket_moves(
    moves: list[dict],
    polygon: Polygon,
    layer_index: int,
    z: float,
    model_bounds: dict,
    params: MachiningParams,
    tool_radius: float,
    warnings: list[str],
) -> bool:
    layer_has_moves = False
    if params.strategy == ToolpathStrategy.zigzag:
        cut_geometry = _offset_geometry(polygon, -tool_radius)
        for segment in _zigzag_segments(cut_geometry, params):
            _add_contour_moves(moves, segment, z, model_bounds, params)
            layer_has_moves = True
    elif params.strategy == ToolpathStrategy.contour:
        cut_geometry = _offset_geometry(polygon, -tool_radius)
        if cut_geometry.is_empty:
            warnings.append(f"Offset de herramienta vacío en capa {layer_index}; se usa contorno original.")
            cut_geometry = polygon
        for cut_polygon in _iter_polygons(cut_geometry):
            for contour in _contours_from_polygon(cut_polygon):
                _add_contour_moves(moves, contour, z, model_bounds, params)
                layer_has_moves = True
    else:
        distance = tool_radius
        generated_offset = False
        while True:
            cut_geometry = _offset_geometry(polygon, -distance)
            if cut_geometry.is_empty:
                break
            generated_offset = True
            for cut_polygon in _iter_polygons(cut_geometry):
                for contour in _contours_from_polygon(cut_polygon):
                    _add_contour_moves(moves, contour, z, model_bounds, params)
                    layer_has_moves = True
            distance += params.step_over_mm
        if not generated_offset:
            warnings.append(f"No fue posible crear offsets internos en capa {layer_index}; se usa contorno original.")
            for contour in _contours_from_polygon(polygon):
                _add_contour_moves(moves, contour, z, model_bounds, params)
                layer_has_moves = True
    return layer_has_moves


def generate_toolpaths(slicing: dict, params: MachiningParams) -> ToolpathResult:
    moves: list[dict] = []
    warnings: list[str] = list(slicing.get("warnings", []))
    anomalies: list[str] = []
    model_bounds = slicing["modelBounds"]
    tool_radius = params.tool_diameter_mm / 2.0
    is_positive_part_strategy = params.strategy == ToolpathStrategy.positive_part_external
    machining_semantics = "positive_part_external" if is_positive_part_strategy else "legacy_internal_pocket"
    stock = _stock_polygon(model_bounds, params.stock_margin_mm)
    convex_hull_fallback_used = bool(slicing.get("convexHullFallbackUsed", False))
    slicing_fallback_used = bool(slicing.get("slicingFallbackUsed", False))
    geometry_preservation_warning = bool(slicing.get("geometryPreservationWarning", False))
    concavity_detected = False
    detail_loss_risk = False
    invalid_toolpath_layers_count = 0

    for layer in slicing["layers"]:
        geometry = _build_layer_geometry(layer["contours"], params)
        if geometry is None or geometry.is_empty:
            warnings.append(f"Capa {layer['index']} sin geometría cerrada utilizable.")
            invalid_toolpath_layers_count += 1
            continue
        layer_concave = _is_concave(geometry, params.tolerance_mm)
        concavity_detected = concavity_detected or layer_concave
        layer_detail_loss_risk = layer_concave and _detail_loss_risk(geometry, tool_radius, params.tolerance_mm)
        detail_loss_risk = detail_loss_risk or layer_detail_loss_risk
        convex_hull_fallback_used = convex_hull_fallback_used or bool(layer.get("convexHullFallbackUsed", False))
        slicing_fallback_used = slicing_fallback_used or bool(layer.get("slicingFallbackUsed", False))
        geometry_preservation_warning = geometry_preservation_warning or bool(layer.get("geometryPreservationWarning", False))

        if layer_detail_loss_risk:
            warnings.append(
                f"Capa {layer['index']}: el diámetro de herramienta puede impedir reproducir detalles o concavidades pequeñas; "
                "considera reducir tool_diameter_mm."
            )

        layer_z = float(layer["machineZ"])
        layer_has_moves = False
        try:
            if is_positive_part_strategy:
                added = _add_positive_part_external_moves(
                    moves,
                    geometry,
                    stock,
                    layer_z,
                    model_bounds,
                    params,
                    tool_radius,
                )
                layer_has_moves = added > 0
                if not layer_has_moves:
                    message = (
                        f"Capa {layer['index']} sin área externa válida para conservar la pieza; "
                        "revisa stock_margin_mm y tool_diameter_mm."
                    )
                    warnings.append(message)
                    anomalies.append(message)
                    invalid_toolpath_layers_count += 1
            else:
                for polygon in _iter_polygons(geometry):
                    layer_has_moves = (
                        _add_internal_pocket_moves(
                            moves,
                            polygon,
                            layer["index"],
                            layer_z,
                            model_bounds,
                            params,
                            tool_radius,
                            warnings,
                        )
                        or layer_has_moves
                    )
        except Exception as exc:
            warnings.append(f"Falló la estrategia en capa {layer['index']}: {exc}")

        if not layer_has_moves:
            anomalies.append(f"La capa {layer['index']} no generó movimientos de corte.")
            invalid_toolpath_layers_count += 1

    if not moves:
        anomalies.append("No se generaron movimientos de herramienta.")
    if convex_hull_fallback_used:
        message = "Se usó convex hull fallback; la geometría original puede no preservarse."
        if message not in anomalies:
            anomalies.append(message)
        geometry_preservation_warning = True
    if detail_loss_risk:
        geometry_preservation_warning = True

    concavity_preserved = bool(concavity_detected and not convex_hull_fallback_used)

    return ToolpathResult(
        moves=moves,
        warnings=warnings,
        anomalies=anomalies,
        bounds=model_bounds,
        machining_semantics=machining_semantics,
        uses_internal_pocket=not is_positive_part_strategy,
        stock_margin_mm=float(params.stock_margin_mm),
        tool_radius_mm=float(tool_radius),
        convex_hull_fallback_used=convex_hull_fallback_used,
        slicing_fallback_used=slicing_fallback_used,
        geometry_preservation_warning=geometry_preservation_warning,
        concavity_detected=concavity_detected,
        concavity_preserved=concavity_preserved,
        detail_loss_risk=detail_loss_risk,
        skipped_layers_count=int(slicing.get("skippedLayersCount", 0)),
        invalid_toolpath_layers_count=invalid_toolpath_layers_count,
    )
