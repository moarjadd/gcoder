import trimesh

from app.schemas.machining import MachiningParams
from app.services.conversion_service import convert_mesh


def test_conversion_service_returns_real_gcode_for_simple_box():
    mesh = trimesh.creation.box(extents=(10, 10, 4))
    result = convert_mesh(mesh, "box.stl", MachiningParams(step_down_mm=1.0, strategy="contour"))

    assert result["status"] == "success"
    assert result["linesCount"] > 10
    assert result["report"]["conversionSuccess"] is True
    assert result["report"]["layersCount"] > 0
    assert result["report"]["tool_diameter_mm"] == 3.0
    assert result["report"]["tool_radius_mm"] == 1.5
    assert result["gcode"].splitlines()[:5] == ["G21", "G90", "G17", "G94", "G54"]
    assert ";" not in result["gcode"]
    assert "(" not in result["gcode"]
    assert ")" not in result["gcode"]
    assert "M30" in result["gcode"]
