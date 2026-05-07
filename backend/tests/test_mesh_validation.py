import trimesh

from app.core.machinability import analyze_machinability
from app.core.mesh_validation import validate_mesh
from app.services.analysis_service import analyze_mesh


def test_box_mesh_is_valid_and_three_axis_compatible():
    mesh = trimesh.creation.box(extents=(20, 10, 5))

    validation = validate_mesh(mesh)
    machinability = analyze_machinability(mesh, validation)

    assert validation["isValid"] is True
    assert validation["isWatertight"] is True
    assert validation["faceCount"] == 12
    assert machinability["isThreeAxisMachinable"] is True
    assert machinability["hasPotentialUndercuts"] is False


def test_empty_mesh_is_invalid():
    mesh = trimesh.Trimesh(vertices=[], faces=[])

    validation = validate_mesh(mesh)

    assert validation["isValid"] is False
    assert validation["isEmpty"] is True
    assert validation["errors"]


def test_analysis_service_for_box_has_stable_thesis_status_and_dimensions():
    mesh = trimesh.creation.box(extents=(20, 10, 5))

    result = analyze_mesh(mesh, "box.stl", file_size_bytes=123)

    assert result["fileSizeBytes"] == 123
    assert result["validation"]["isValid"] is True
    assert result["machinability"]["isThreeAxisMachinable"] is True
    assert result["mesh"]["triangleCount"] > 0
    assert result["mesh"]["dimensions"]["x"] > 0
    assert result["mesh"]["dimensions"]["y"] > 0
    assert result["mesh"]["dimensions"]["z"] > 0
    assert result["thesisFriendlyStatus"] == "APTO_PARA_CONVERSION"
