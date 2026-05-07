import trimesh
import json
import pytest
from fastapi.testclient import TestClient
from trimesh.exchange.stl import export_stl, export_stl_ascii

from app.main import app


client = TestClient(app)


def _box_mesh():
    return trimesh.creation.box(extents=(20, 10, 5))


def _rectangular_box_mesh():
    return trimesh.creation.box(extents=(10, 20, 30))


def test_health_endpoint():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "gcoder-backend"}


def test_analyze_accepts_binary_stl():
    payload = export_stl(_box_mesh())

    response = client.post(
        "/api/analyze",
        files={"file": ("box-binary.stl", payload, "model/stl")},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["filename"] == "box-binary.stl"
    assert body["fileSizeBytes"] == len(payload)
    assert body["mesh"]["triangleCount"] > 0
    assert body["validation"]["isValid"] is True
    assert body["machinability"]["isThreeAxisMachinable"] is True
    assert body["thesisFriendlyStatus"] == "APTO_PARA_CONVERSION"


def test_analyze_accepts_ascii_stl():
    payload = export_stl_ascii(_box_mesh()).encode("utf-8")

    response = client.post(
        "/api/analyze",
        files={"file": ("box-ascii.stl", payload, "model/stl")},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["mesh"]["isWatertight"] is True
    assert body["mesh"]["dimensions"]["x"] > 0
    assert body["mesh"]["dimensions"]["y"] > 0
    assert body["mesh"]["dimensions"]["z"] > 0


def test_analyze_rejects_invalid_stl_payload():
    response = client.post(
        "/api/analyze",
        files={"file": ("broken.stl", b"esto no es stl valido", "model/stl")},
    )

    assert response.status_code == 400
    assert "STL" in response.json()["detail"]


def test_analyze_rejects_non_stl_file():
    response = client.post(
        "/api/analyze",
        files={"file": ("model.obj", b"not stl", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Formato no soportado. Por ahora el sistema solo acepta archivos STL."


def test_analyze_without_transform_applies_identity_transform():
    payload = export_stl(_box_mesh())

    response = client.post(
        "/api/analyze",
        files={"file": ("box.stl", payload, "model/stl")},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["transformApplied"] == {
        "rotation_x_deg": 0.0,
        "rotation_y_deg": 0.0,
        "rotation_z_deg": 0.0,
        "scale": 1.0,
    }


def test_analyze_with_scale_doubles_dimensions():
    payload = export_stl(_rectangular_box_mesh())

    response = client.post(
        "/api/analyze",
        files={"file": ("scaled-box.stl", payload, "model/stl")},
        data={"transform": json.dumps({"scale": 2.0})},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["bounds"]["size"] == [20.0, 40.0, 60.0]
    assert body["mesh"]["dimensions"] == {"x": 20.0, "y": 40.0, "z": 60.0}
    assert body["transformApplied"]["scale"] == 2.0


def test_analyze_with_90_degree_rotation_swaps_dimensions_and_normalizes_z():
    payload = export_stl(_rectangular_box_mesh())

    response = client.post(
        "/api/analyze",
        files={"file": ("rotated-box.stl", payload, "model/stl")},
        data={"transform": json.dumps({"rotation_x_deg": 90})},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["bounds"]["size"] == pytest.approx([10.0, 30.0, 20.0])
    assert body["bounds"]["min"][2] == 0.0
    assert body["transformApplied"]["rotation_x_deg"] == 90.0
