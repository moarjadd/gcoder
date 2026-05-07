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
    stl_payload,
)


client = TestClient(app)


def _box_payload():
    return export_stl(trimesh.creation.box(extents=(10, 10, 4)))


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
