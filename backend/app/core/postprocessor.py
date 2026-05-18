from app.core.units import format_mm
from app.schemas.machining import MachiningParams


def _fmt(value: float) -> str:
    return format_mm(value)


def _format_move(move: dict) -> str:
    command = "G0" if move["kind"] == "rapid" else "G1"
    parts = [command]
    if "x" in move:
        parts.append(f"X{_fmt(move['x'])}")
    if "y" in move:
        parts.append(f"Y{_fmt(move['y'])}")
    if "z" in move:
        parts.append(f"Z{_fmt(move['z'])}")
    if "feed" in move:
        parts.append(f"F{_fmt(move['feed'])}")
    return " ".join(parts)


def generate_gcode(
    toolpath: dict | list[dict],
    params: MachiningParams,
    program_name: str = "G-Coder",
    setup_metadata: dict | None = None,
) -> str:
    moves = toolpath["moves"] if isinstance(toolpath, dict) else toolpath
    if not moves:
        raise ValueError("No hay movimientos válidos para generar G-code.")

    lines = [
        "G21",
        "G90",
        "G17",
        "G94",
        "G54",
        f"G0 Z{_fmt(params.safe_z_mm)}",
        f"M3 S{int(params.spindle_rpm)}",
    ]
    current_z = params.safe_z_mm
    for move in moves:
        is_rapid_xy = move["kind"] == "rapid" and ("x" in move or "y" in move)
        if is_rapid_xy and current_z < params.safe_z_mm:
            lines.append(f"G0 Z{_fmt(params.safe_z_mm)}")
            current_z = params.safe_z_mm

        lines.append(_format_move(move))
        if "z" in move:
            current_z = float(move["z"])

    lines.extend([f"G0 Z{_fmt(params.safe_z_mm)}", "M5", "M30"])
    return "\n".join(lines) + "\n"
