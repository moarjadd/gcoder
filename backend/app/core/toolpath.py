from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon
from shapely.ops import unary_union

from app.core.geometry import transform_xy_to_work_origin
from app.core.units import clean_mm
from app.schemas.machining import MachiningParams


@dataclass
class ToolpathResult:
    moves: list[dict]
    warnings: list[str]
    anomalies: list[str]
    bounds: dict


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


def generate_toolpaths(slicing: dict, params: MachiningParams) -> ToolpathResult:
    moves: list[dict] = []
    warnings: list[str] = list(slicing.get("warnings", []))
    anomalies: list[str] = []
    model_bounds = slicing["modelBounds"]
    tool_radius = params.tool_diameter_mm / 2.0

    for layer in slicing["layers"]:
        geometry = _build_layer_geometry(layer["contours"], params)
        if geometry is None or geometry.is_empty:
            warnings.append(f"Capa {layer['index']} sin geometría cerrada utilizable.")
            continue

        layer_z = float(layer["machineZ"])
        layer_has_moves = False
        for polygon in _iter_polygons(geometry):
            try:
                if params.strategy == "zigzag":
                    cut_geometry = _offset_geometry(polygon, -tool_radius)
                    for segment in _zigzag_segments(cut_geometry, params):
                        _add_contour_moves(moves, segment, layer_z, model_bounds, params)
                        layer_has_moves = True
                elif params.strategy == "contour":
                    cut_geometry = _offset_geometry(polygon, -tool_radius)
                    if cut_geometry.is_empty:
                        warnings.append(f"Offset de herramienta vacío en capa {layer['index']}; se usa contorno original.")
                        cut_geometry = polygon
                    for cut_polygon in _iter_polygons(cut_geometry):
                        for contour in _contours_from_polygon(cut_polygon):
                            _add_contour_moves(moves, contour, layer_z, model_bounds, params)
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
                                _add_contour_moves(moves, contour, layer_z, model_bounds, params)
                                layer_has_moves = True
                        distance += params.step_over_mm
                    if not generated_offset:
                        warnings.append(f"No fue posible crear offsets internos en capa {layer['index']}; se usa contorno original.")
                        for contour in _contours_from_polygon(polygon):
                            _add_contour_moves(moves, contour, layer_z, model_bounds, params)
                            layer_has_moves = True
            except Exception as exc:
                warnings.append(f"Falló la estrategia en capa {layer['index']}: {exc}")

        if not layer_has_moves:
            anomalies.append(f"La capa {layer['index']} no generó movimientos de corte.")

    if not moves:
        anomalies.append("No se generaron movimientos de herramienta.")

    return ToolpathResult(moves=moves, warnings=warnings, anomalies=anomalies, bounds=model_bounds)
