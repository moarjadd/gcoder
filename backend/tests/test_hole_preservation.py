import json
import math

import numpy as np
from fastapi.testclient import TestClient

from app.core.slicer import _contours_at_z, slice_mesh
from app.main import app
from app.schemas.machining import MachiningParams
from tests.stl_dataset import annular_cylinder_mesh, cube_mesh, rectangular_frame_mesh, stl_payload


client = TestClient(app)


def _linear_cut_points(gcode: str):
    current = {"x": None, "y": None, "z": None}
    for line in gcode.splitlines():
        motion = line.split(";", 1)[0].strip()
        if not motion:
            continue
        tokens = motion.split()
        if tokens[0] not in {"G0", "G1"}:
            continue
        for token in tokens[1:]:
            axis = token[0]
            if axis in {"X", "Y", "Z"}:
                current[axis.lower()] = float(token[1:])
        if tokens[0] == "G1" and current["x"] is not None and current["y"] is not None and (current["z"] or 0) < 0:
            yield current["x"], current["y"], current["z"]


def test_annular_stl_preserves_internal_hole_and_reports_precision_metrics():
    mesh = annular_cylinder_mesh(outer_radius=8.0, inner_radius=3.5, height=6.0)
    slicing = slice_mesh(mesh, MachiningParams(step_down_mm=2.0, stock_margin_mm=8.0))

    assert slicing["layers"]
    assert all(layer["has_holes"] for layer in slicing["layers"])
    assert all(layer["hole_count"] > 0 for layer in slicing["layers"])

    analyze_response = client.post(
        "/api/analyze",
        files={"file": ("annular.stl", stl_payload(mesh), "model/stl")},
    )
    analyze_body = analyze_response.json()
    assert analyze_response.status_code == 200, analyze_body
    assert analyze_body["machinability"]["isThreeAxisMachinable"] is True

    response = client.post(
        "/api/convert",
        files={"file": ("annular.stl", stl_payload(mesh), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "step_down_mm": 2.0,
                    "stock_margin_mm": 8.0,
                }
            )
        },
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert report["total_holes_detected"] > 0
    assert report["total_holes_preserved"] == report["total_holes_detected"]
    assert report["hole_preservation_rate"] == 1.0
    assert report["rmse_mm"] is not None
    assert report["convex_hull_fallback_used"] is False

    center_x = 8.0 + report["stock_margin_mm"]
    center_y = 8.0 + report["stock_margin_mm"]
    tool_radius = report["tool_radius_mm"]
    internal_cut_points = [
        (x, y, z)
        for x, y, z in _linear_cut_points(body["gcode"])
        if math.dist((x, y), (center_x, center_y)) < 3.5 - tool_radius + 0.25
    ]
    assert internal_cut_points


def test_rectangular_frame_preserves_rectangular_hole_and_reports_metrics():
    mesh = rectangular_frame_mesh(
        outer_width=24.0,
        outer_depth=18.0,
        inner_width=10.0,
        inner_depth=6.0,
        height=6.0,
    )
    slicing = slice_mesh(mesh, MachiningParams(step_down_mm=2.0, stock_margin_mm=8.0))
    assert all(layer["has_holes"] for layer in slicing["layers"])
    assert all(layer["hole_count"] == 1 for layer in slicing["layers"])

    response = client.post(
        "/api/convert",
        files={"file": ("frame.stl", stl_payload(mesh), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "step_down_mm": 2.0,
                    "stock_margin_mm": 8.0,
                }
            )
        },
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert report["total_holes_detected"] > 0
    assert report["hole_preservation_rate"] == 1.0
    assert report["rmse_mm"] is not None
    assert report["area_error_percent"] is not None

    center_x = 12.0 + report["stock_margin_mm"]
    center_y = 9.0 + report["stock_margin_mm"]
    tool_radius = report["tool_radius_mm"]
    internal_cut_points = [
        (x, y, z)
        for x, y, z in _linear_cut_points(body["gcode"])
        if abs(x - center_x) < 5.0 - tool_radius + 0.25
        and abs(y - center_y) < 3.0 - tool_radius + 0.25
    ]
    assert internal_cut_points


def test_simple_cube_still_converts_and_reports_rmse_with_standard_header():
    response = client.post(
        "/api/convert",
        files={"file": ("cube.stl", stl_payload(cube_mesh()), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "step_down_mm": 2.0,
                    "stock_margin_mm": 8.0,
                }
            )
        },
    )
    body = response.json()
    assert response.status_code == 200, body
    assert body["report"]["rmse_mm"] is not None
    for command in ("G21", "G90", "G17", "G94", "G54", "M3 S12000", "M5", "M30"):
        assert command in body["gcode"]


def test_too_small_hole_warns_and_is_not_silently_reported_as_preserved():
    mesh = rectangular_frame_mesh(inner_width=1.0, inner_depth=1.0, height=6.0)
    response = client.post(
        "/api/convert",
        files={"file": ("tiny-hole-frame.stl", stl_payload(mesh), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "step_down_mm": 2.0,
                    "stock_margin_mm": 8.0,
                }
            )
        },
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert report["total_holes_detected"] > 0
    assert report["total_holes_preserved"] < report["total_holes_detected"]
    assert report["hole_preservation_rate"] < 1.0
    assert report["rmse_mm"] is not None
    assert "HOLE_TOO_SMALL_FOR_TOOL" in report["warning_codes"]
    assert "HOLE_PRESERVATION_INCOMPLETE" in report["warning_codes"]
    assert any("HOLE_TOO_SMALL_FOR_TOOL" in warning for warning in report["warnings"])


def test_convex_hull_fallback_is_reported_as_geometry_preservation_warning():
    triangles = np.array(
        [
            [[0.0, 0.0, 0.0], [4.0, 0.0, 1.0], [0.0, 0.0, 1.0]],
            [[0.0, 0.0, 0.0], [0.0, 4.0, 1.0], [0.0, 0.0, 1.0]],
            [[4.0, 0.0, 0.0], [0.0, 4.0, 1.0], [4.0, 0.0, 1.0]],
        ]
    )
    triangle_z_min = triangles[:, :, 2].min(axis=1)
    triangle_z_max = triangles[:, :, 2].max(axis=1)

    section = _contours_at_z(triangles, triangle_z_min, triangle_z_max, z=0.5, tolerance=0.01)

    assert section["convex_hull_fallback_used"] is True
    assert section["geometry_preservation_warning"] is True
    assert section["has_holes"] is False
