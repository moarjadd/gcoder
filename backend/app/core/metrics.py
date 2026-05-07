import math
import time
from typing import Any


def now_seconds() -> float:
    return time.perf_counter()


def compute_metrics(start_time: float, moves: list[dict], gcode: str, layers_count: int, warnings: list[str], anomalies: list[str]) -> dict[str, Any]:
    xs = [move["x"] for move in moves if "x" in move]
    ys = [move["y"] for move in moves if "y" in move]
    zs = [move["z"] for move in moves if "z" in move]

    path_length = 0.0
    current = {"x": None, "y": None, "z": None}
    for move in moves:
        next_pos = current.copy()
        for axis in ("x", "y", "z"):
            if axis in move:
                next_pos[axis] = move[axis]
        if all(current[axis] is not None and next_pos[axis] is not None for axis in ("x", "y", "z")):
            path_length += math.dist(
                [current["x"], current["y"], current["z"]],
                [next_pos["x"], next_pos["y"], next_pos["z"]],
            )
        current = next_pos

    return {
        "processing_time_seconds": round(time.perf_counter() - start_time, 4),
        "layer_count": layers_count,
        "toolpath_move_count": len(moves),
        "gcode_line_count": len(gcode.splitlines()),
        "path_bounds": {
            "min": [min(xs) if xs else None, min(ys) if ys else None, min(zs) if zs else None],
            "max": [max(xs) if xs else None, max(ys) if ys else None, max(zs) if zs else None],
        },
        "estimated_path_length_mm": round(path_length, 3),
        "warnings_count": len(warnings),
        "anomalies_count": len(anomalies),
        "rmse_mm": None,
        "rmse_note": "RMSE no calculado en esta fase; requiere comparar trayectoria/material removido contra geometría objetivo.",
    }
