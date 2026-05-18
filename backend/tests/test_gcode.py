from app.core.postprocessor import generate_gcode
from app.schemas.machining import MachiningParams


def _assert_no_gcode_comments(gcode: str):
    assert not any(line.startswith(";") for line in gcode.splitlines())
    assert ";" not in gcode
    assert "(" not in gcode
    assert ")" not in gcode


def test_default_tool_is_three_millimeters():
    params = MachiningParams()

    assert params.tool_diameter_mm == 3.0
    assert params.tool_diameter_mm / 2 == 1.5


def test_postprocessor_generates_safe_grbl_style_program():
    params = MachiningParams()
    moves = [
        {"kind": "rapid", "z": params.safe_z_mm},
        {"kind": "rapid", "x": 0.0, "y": 0.0},
        {"kind": "linear", "z": -1.0, "feed": params.plunge_rate_mm_min},
        {"kind": "linear", "x": 10.0, "y": 0.0, "feed": params.feed_rate_mm_min},
    ]

    gcode = generate_gcode({"moves": moves}, params, "test.stl")

    assert gcode.splitlines()[:5] == ["G21", "G90", "G17", "G94", "G54"]
    _assert_no_gcode_comments(gcode)
    assert "G21" in gcode
    assert "G90" in gcode
    assert "G17" in gcode
    assert "G94" in gcode
    assert "G54" in gcode
    assert "G0 Z5.000" in gcode
    assert "M3 S12000" in gcode
    assert "G1 Z-1.000 F200.000" in gcode
    assert "M5" in gcode
    assert gcode.rstrip().endswith("M30")


def test_generated_program_raises_to_safe_z_before_rapid_xy_moves():
    params = MachiningParams(safe_z_mm=5.0)
    moves = [
        {"kind": "rapid", "z": params.safe_z_mm},
        {"kind": "rapid", "x": 1.0, "y": 2.0},
        {"kind": "linear", "z": -1.0, "feed": params.plunge_rate_mm_min},
        {"kind": "linear", "x": 3.0, "y": 2.0, "feed": params.feed_rate_mm_min},
        {"kind": "rapid", "z": params.safe_z_mm},
        {"kind": "rapid", "x": 4.0, "y": 5.0},
    ]

    gcode = generate_gcode({"moves": moves}, params, "safe-test.stl")
    current_z = None
    for line in gcode.splitlines():
        if line.startswith(";") or not line:
            continue
        tokens = line.split()
        if tokens[0] in {"G0", "G1"}:
            for token in tokens[1:]:
                if token.startswith("Z"):
                    current_z = float(token[1:])
            rapid_xy = tokens[0] == "G0" and any(token.startswith(("X", "Y")) for token in tokens[1:])
            if rapid_xy:
                assert current_z is not None
                assert current_z >= params.safe_z_mm


def test_postprocessor_inserts_safe_z_before_unsafe_rapid_xy():
    params = MachiningParams(safe_z_mm=5.0)
    moves = [
        {"kind": "linear", "z": -1.0, "feed": params.plunge_rate_mm_min},
        {"kind": "rapid", "x": 10.0, "y": 10.0},
    ]

    gcode = generate_gcode({"moves": moves}, params, "safe-insert.stl")
    lines = gcode.splitlines()
    rapid_xy_index = next(i for i, line in enumerate(lines) if line.startswith("G0 X10.000 Y10.000"))

    assert lines[rapid_xy_index - 1] == "G0 Z5.000"
