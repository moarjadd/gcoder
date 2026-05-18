import json

import trimesh
from fastapi.testclient import TestClient
from trimesh.exchange.stl import export_stl

from app.main import app
from tests.stl_dataset import (
    CONTROLLED_STL_CASES,
    cone_mesh,
    cube_mesh,
    cylinder_mesh,
    invalid_flat_mesh,
    overhang_mesh,
    rectangular_prism_mesh,
    semicylinder_curved_base_mesh,
    semicylinder_flat_base_mesh,
    star_prism_mesh,
    stl_payload,
)


client = TestClient(app)


def _assert_numeric_timing(payload: dict, field_names: list[str]):
    for field_name in field_names:
        assert type(payload[field_name]) in (int, float)
        assert payload[field_name] >= 0


def _box_payload():
    return export_stl(trimesh.creation.box(extents=(10, 10, 4)))


def _assert_safe_z_before_rapid_xy(gcode: str, safe_z: float):
    current_z = None
    for line in gcode.splitlines():
        if line.startswith(";") or not line:
            continue
        tokens = line.split()
        if tokens[0] in {"G0", "G1"}:
            motion_tokens = line.split(";", 1)[0].split()
            for token in motion_tokens[1:]:
                if token.startswith("Z"):
                    current_z = float(token[1:])
            rapid_xy = tokens[0] == "G0" and any(token.startswith(("X", "Y")) for token in motion_tokens[1:])
            if rapid_xy:
                assert current_z is not None
                assert current_z >= safe_z


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


def test_convert_endpoint_returns_gcode_for_simple_box():
    response = client.post(
        "/api/convert",
        files={"file": ("box.stl", _box_payload(), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "success"
    assert body["gcode"]
    assert body["linesCount"] > 10
    assert body["report"]["conversionSuccess"] is True
    assert body["report"]["layersCount"] > 0
    assert body["report"]["toolpathMovesCount"] > 0
    assert body["report"]["model_name"] == "box.stl"
    assert body["report"]["status"] == "success"
    assert body["report"]["layer_count"] == body["report"]["layersCount"]
    assert body["report"]["toolpath_move_count"] == body["report"]["toolpathMovesCount"]
    assert body["report"]["gcode_line_count"] == body["linesCount"]
    assert body["report"]["processing_time_seconds"] == body["report"]["processingTimeSeconds"]
    assert body["report"]["parameters_used"]["strategy"] == "contour"
    assert body["report"]["machining_semantics"] == "legacy_internal_pocket"
    assert body["report"]["uses_internal_pocket"] is True
    _assert_numeric_timing(
        body["report"],
        [
            "conversion_total_ms",
            "mesh_load_ms",
            "transform_ms",
            "analysis_ms",
            "slicing_ms",
            "toolpath_ms",
            "postprocess_ms",
            "metrics_ms",
        ],
    )
    assert isinstance(body["report"]["conversion_total_human"], str)
    assert isinstance(body["report"]["slicing_human"], str)
    assert isinstance(body["report"]["toolpath_human"], str)
    assert isinstance(body["report"]["postprocess_human"], str)


def test_convert_endpoint_defaults_to_positive_part_external_for_cube():
    response = client.post(
        "/api/convert",
        files={"file": ("cube.stl", stl_payload(cube_mesh()), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 2.0, "safe_z_mm": 7.0})},
    )

    body = response.json()
    report = body["report"]
    metrics = report["metrics"]
    assert response.status_code == 200, body
    assert body["gcode"].strip()
    assert report["parameters_used"]["strategy"] == "positive_part_external"
    assert report["machining_semantics"] == "positive_part_external"
    assert report["uses_internal_pocket"] is False
    assert report["stock_margin_mm"] == report["parameters_used"]["stock_margin_mm"]
    assert report["tool_radius_mm"] == report["parameters_used"]["tool_diameter_mm"] / 2
    assert metrics["machining_semantics"] == "positive_part_external"
    assert metrics["uses_internal_pocket"] is False
    assert metrics["path_bounds"]["min"][0] < report["stock_margin_mm"]
    assert metrics["path_bounds"]["max"][0] > report["stock_margin_mm"] + 10
    assert metrics["path_bounds"]["min"][1] < report["stock_margin_mm"]
    assert metrics["path_bounds"]["max"][1] > report["stock_margin_mm"] + 10
    _assert_safe_z_before_rapid_xy(body["gcode"], 7.0)

    protected_min = report["stock_margin_mm"] - report["tool_radius_mm"]
    protected_max = report["stock_margin_mm"] + 10 + report["tool_radius_mm"]
    rounding_tolerance = 0.01
    for x, y, _z in _linear_cut_points(body["gcode"]):
        assert not (
            protected_min + rounding_tolerance < x < protected_max - rounding_tolerance
            and protected_min + rounding_tolerance < y < protected_max - rounding_tolerance
        )


def test_convert_endpoint_rejects_positive_part_external_with_insufficient_stock_margin():
    response = client.post(
        "/api/convert",
        files={"file": ("cube.stl", stl_payload(cube_mesh()), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "stock_margin_mm": 1.0,
                    "tool_diameter_mm": 3.175,
                }
            )
        },
    )

    assert response.status_code == 422
    assert "stock_margin_mm" in response.json()["detail"]
    assert "mecanizado exterior" in response.json()["detail"]


def test_convert_endpoint_generates_external_paths_for_rectangular_prism_and_cylinder():
    cases = {
        "rectangular-prism.stl": (rectangular_prism_mesh(), 24, 12),
        "cylinder.stl": (cylinder_mesh(), 10, 10),
    }

    for filename, (mesh, width_x, width_y) in cases.items():
        response = client.post(
            "/api/convert",
            files={"file": (filename, stl_payload(mesh), "model/stl")},
            data={"params": json.dumps({"strategy": "positive_part_external", "step_down_mm": 2.0})},
        )
        body = response.json()
        report = body["report"]
        bounds = report["metrics"]["path_bounds"]

        assert response.status_code == 200, body
        assert body["gcode"].strip()
        assert report["machining_semantics"] == "positive_part_external"
        assert report["uses_internal_pocket"] is False
        assert report["toolpath_move_count"] > 0
        assert bounds["min"][0] < report["stock_margin_mm"]
        assert bounds["max"][0] > report["stock_margin_mm"] + width_x
        assert bounds["min"][1] < report["stock_margin_mm"]
        assert bounds["max"][1] > report["stock_margin_mm"] + width_y


def test_analyze_star_prism_detects_accessible_concavity():
    response = client.post(
        "/api/analyze",
        files={"file": ("star-prism.stl", stl_payload(star_prism_mesh()), "model/stl")},
    )
    body = response.json()

    assert response.status_code == 200, body
    assert body["validation"]["isValid"] is True
    assert body["machinability"]["isThreeAxisMachinable"] is True
    assert body["machinability"]["isLikelyConvex"] is False
    assert body["machinability"]["details"]["concavityDetected"] is True
    assert body["thesisFriendlyStatus"] == "APTO_CON_ADVERTENCIAS"
    assert "convexity_ratio_below_threshold" in body["classification_reasons"]
    assert "concavity_detected_accessible" in body["classification_reasons"]
    assert body["warning_details"]["concavity_detected"] is True
    assert body["warning_details"]["convexity_threshold"] == 0.98
    assert any("cóncava" in warning or "convexa" in warning for warning in body["warnings"])


def test_convert_star_prism_preserves_concavity_without_convex_hull_fallback():
    response = client.post(
        "/api/convert",
        files={"file": ("star-prism.stl", stl_payload(star_prism_mesh()), "model/stl")},
        data={"params": json.dumps({"strategy": "positive_part_external", "step_down_mm": 2.0})},
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert body["gcode"].strip()
    assert report["machining_semantics"] == "positive_part_external"
    assert report["uses_internal_pocket"] is False
    assert report["concavity_detected"] is True
    assert report["concavity_preserved"] is True
    assert report["convex_hull_fallback_used"] is False
    assert report["geometry_preservation_warning"] is False
    assert "convex hull fallback" not in " ".join(report["anomalies"]).lower()


def test_convert_star_prism_with_large_tool_reports_detail_loss_risk():
    response = client.post(
        "/api/convert",
        files={"file": ("star-prism.stl", stl_payload(star_prism_mesh()), "model/stl")},
        data={
            "params": json.dumps(
                {
                    "strategy": "positive_part_external",
                    "tool_diameter_mm": 7.0,
                    "step_over_mm": 3.0,
                    "stock_margin_mm": 12.0,
                    "step_down_mm": 2.0,
                }
            )
        },
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert body["gcode"].strip()
    assert report["detail_loss_risk"] is True
    assert report["geometry_preservation_warning"] is True
    assert report["convex_hull_fallback_used"] is False
    assert "detail_loss_risk" in report["warning_codes"]
    assert report["warning_details"]["detail_loss_risk"] is True
    assert any("diámetro de herramienta" in warning for warning in report["warnings"])


def test_convert_reports_complexity_when_step_down_is_too_small():
    response = client.post(
        "/api/convert",
        files={"file": ("cube.stl", stl_payload(cube_mesh()), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 0.03, "strategy": "contour"})},
    )
    body = response.json()
    report = body["report"]

    assert response.status_code == 200, body
    assert report["estimated_layer_count"] > report["recommended_max_layers"]
    assert report["step_down_layer_warning"] is True
    assert report["estimated_operation_complexity"] >= report["estimated_layer_count"]
    assert "too_many_slicing_layers" in report["warning_codes"]


def test_convert_endpoint_gcode_has_complete_cnc_header_and_footer():
    response = client.post(
        "/api/convert",
        files={"file": ("box.stl", _box_payload(), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
    )

    gcode = response.json()["gcode"]
    assert response.status_code == 200
    for command in ("G21", "G90", "G17", "G94", "G54", "M3 S12000", "M5", "M30"):
        assert command in gcode
    assert gcode.rstrip().endswith("M30")


def test_convert_endpoint_rejects_non_stl_file():
    response = client.post(
        "/api/convert",
        files={"file": ("box.obj", b"not an stl", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Formato no soportado. Por ahora el sistema solo acepta archivos STL."


def test_convert_endpoint_with_transform_returns_gcode_and_transform_applied():
    response = client.post(
        "/api/convert",
        files={"file": ("box.stl", _box_payload(), "model/stl")},
        data={
            "params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"}),
            "transform": json.dumps({"rotation_z_deg": 90, "scale": 1.5}),
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert body["gcode"].strip()
    assert body["transformApplied"] == {
        "rotation_x_deg": 0.0,
        "rotation_y_deg": 0.0,
        "rotation_z_deg": 90.0,
        "scale": 1.5,
    }


def test_convert_endpoint_rejects_invalid_transform_scale():
    response = client.post(
        "/api/convert",
        files={"file": ("box.stl", _box_payload(), "model/stl")},
        data={
            "params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"}),
            "transform": json.dumps({"scale": 0}),
        },
    )

    assert response.status_code == 422
    assert "Transformación de modelo inválida" in response.json()["detail"]


def test_controlled_dataset_has_expected_cases():
    assert set(CONTROLLED_STL_CASES) == {
        "cube.stl",
        "rectangular-prism.stl",
        "cylinder.stl",
        "cone.stl",
        "star-prism.stl",
        "invalid-flat.stl",
        "overhang.stl",
        "semicylinder_flat_base.stl",
        "semicylinder_curved_base.stl",
    }


def test_convert_endpoint_accepts_controlled_valid_solids():
    valid_cases = {
        "cube.stl": cube_mesh(),
        "rectangular-prism.stl": rectangular_prism_mesh(),
        "cylinder.stl": cylinder_mesh(),
        "cone.stl": cone_mesh(),
    }

    for filename, mesh in valid_cases.items():
        response = client.post(
            "/api/convert",
            files={"file": (filename, stl_payload(mesh), "model/stl")},
            data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
        )
        body = response.json()

        assert response.status_code == 200, body
        assert body["status"] == "success"
        assert body["gcode"].strip()
        assert body["report"]["status"] == "success"
        assert body["report"]["model_name"] == filename
        assert body["report"]["layer_count"] > 0
        assert body["report"]["toolpath_move_count"] > 0
        assert body["report"]["gcode_line_count"] == len(body["gcode"].splitlines())


def test_convert_endpoint_rejects_invalid_flat_mesh():
    response = client.post(
        "/api/convert",
        files={"file": ("invalid-flat.stl", stl_payload(invalid_flat_mesh()), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "El archivo STL no contiene una malla válida para conversión."


def test_convert_endpoint_rejects_potential_undercut_geometry():
    response = client.post(
        "/api/convert",
        files={"file": ("overhang.stl", stl_payload(overhang_mesh()), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "El modelo no parece compatible con mecanizado CNC router de 3 ejes."


def test_analyze_warns_or_rejects_potential_undercut_geometry():
    response = client.post(
        "/api/analyze",
        files={"file": ("overhang.stl", stl_payload(overhang_mesh()), "model/stl")},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["thesisFriendlyStatus"] == "NO_APTO_POR_GEOMETRIA"
    assert body["machinability"]["hasPotentialUndercuts"] is True
    assert body["warnings"]


def test_generated_gcode_from_endpoint_keeps_safe_z_before_rapid_xy():
    response = client.post(
        "/api/convert",
        files={"file": ("cube.stl", stl_payload(cube_mesh()), "model/stl")},
        data={"params": json.dumps({"safe_z_mm": 7.0, "step_down_mm": 2.0, "strategy": "contour"})},
    )

    gcode = response.json()["gcode"]
    assert response.status_code == 200
    current_z = None
    for line in gcode.splitlines():
        if line.startswith(";") or not line:
            continue
        tokens = line.split()
        if tokens[0] in {"G0", "G1"}:
            motion_tokens = line.split(";", 1)[0].split()
            for token in motion_tokens[1:]:
                if token.startswith("Z"):
                    current_z = float(token[1:])
            rapid_xy = tokens[0] == "G0" and any(token.startswith(("X", "Y")) for token in motion_tokens[1:])
            if rapid_xy:
                assert current_z is not None
                assert current_z >= 7.0


def test_analyze_semicylinder_orientation_changes_machinability_score():
    flat_response = client.post(
        "/api/analyze",
        files={"file": ("semicylinder_flat_base.stl", stl_payload(semicylinder_flat_base_mesh()), "model/stl")},
    )
    curved_response = client.post(
        "/api/analyze",
        files={"file": ("semicylinder_curved_base.stl", stl_payload(semicylinder_curved_base_mesh()), "model/stl")},
    )

    flat = flat_response.json()
    curved = curved_response.json()
    assert flat_response.status_code == 200
    assert curved_response.status_code == 200
    assert flat["transformApplied"] == {
        "rotation_x_deg": 0.0,
        "rotation_y_deg": 0.0,
        "rotation_z_deg": 0.0,
        "scale": 1.0,
    }
    assert curved["bounds"]["min"][2] == 0.0
    assert flat["bounds"]["min"][2] == 0.0
    assert flat["machinability"]["accessibilityScore"] > curved["machinability"]["accessibilityScore"]
    assert flat["machinability"]["baseFlatnessScore"] > curved["machinability"]["baseFlatnessScore"]
    assert curved["machinability"]["hasPotentialUndercuts"] is True
    assert curved["warnings"]


def test_analyze_semicylinder_transform_can_flip_flat_base_to_curved_base():
    payload = stl_payload(semicylinder_flat_base_mesh())

    flat_response = client.post(
        "/api/analyze",
        files={"file": ("semicylinder_flat_base.stl", payload, "model/stl")},
        data={"transform": json.dumps({"rotation_x_deg": 0})},
    )
    flipped_response = client.post(
        "/api/analyze",
        files={"file": ("semicylinder_flat_base.stl", payload, "model/stl")},
        data={"transform": json.dumps({"rotation_x_deg": 180})},
    )

    flat = flat_response.json()
    flipped = flipped_response.json()
    assert flat_response.status_code == 200
    assert flipped_response.status_code == 200
    assert flipped["transformApplied"]["rotation_x_deg"] == 180.0
    assert flipped["bounds"]["min"][2] == 0.0
    assert flat["machinability"]["accessibilityScore"] > flipped["machinability"]["accessibilityScore"]
    assert flipped["machinability"]["hasPotentialUndercuts"] is True


def test_convert_semicylinder_flat_base_still_generates_gcode():
    response = client.post(
        "/api/convert",
        files={"file": ("semicylinder_flat_base.stl", stl_payload(semicylinder_flat_base_mesh()), "model/stl")},
        data={"params": json.dumps({"step_down_mm": 1.0, "strategy": "contour"})},
    )
    body = response.json()

    assert response.status_code == 200, body
    assert body["gcode"].strip()
    assert body["transformApplied"]["scale"] == 1.0
    assert "M30" in body["gcode"]
