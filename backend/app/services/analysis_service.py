import time

from app.core.transforms import apply_model_transform
from app.core.machinability import analyze_machinability
from app.core.mesh_validation import validate_mesh
from app.schemas.transforms import ModelTransform


def _dimension_object(dimensions: list[float]) -> dict[str, float]:
    return {
        "x": float(dimensions[0]) if len(dimensions) > 0 else 0.0,
        "y": float(dimensions[1]) if len(dimensions) > 1 else 0.0,
        "z": float(dimensions[2]) if len(dimensions) > 2 else 0.0,
    }


def _classify_status(validation: dict, machinability: dict, warnings: list[str]) -> str:
    if validation["errors"]:
        return "NO_APTO_MALLA_INVALIDA"
    if machinability["errors"] or not machinability["isThreeAxisMachinable"]:
        return "NO_APTO_POR_GEOMETRIA"
    if warnings:
        return "APTO_CON_ADVERTENCIAS"
    return "APTO_PARA_CONVERSION"


def analyze_mesh(mesh, filename: str, file_size_bytes: int = 0, transform: ModelTransform | None = None) -> dict:
    start = time.perf_counter()
    transform = transform or ModelTransform()
    mesh = apply_model_transform(mesh, transform)
    validation = validate_mesh(mesh)
    machinability = analyze_machinability(mesh, validation)
    bounds = mesh.bounds
    dimensions = (bounds[1] - bounds[0]).tolist()
    warnings = validation["warnings"] + machinability["warnings"]
    errors = validation["errors"] + machinability["errors"]
    status = _classify_status(validation, machinability, warnings)
    volume_approx = float(abs(mesh.volume)) if mesh.is_watertight else None
    bounds_payload = {
        "min": bounds[0].tolist(),
        "max": bounds[1].tolist(),
        "size": dimensions,
    }

    return {
        "filename": filename,
        "fileSizeBytes": int(file_size_bytes),
        "mesh": {
            "triangleCount": int(len(mesh.faces)),
            "vertexCount": int(len(mesh.vertices)),
            "isEmpty": validation["isEmpty"],
            "isWatertight": validation["isWatertight"],
            "isWindingConsistent": validation["isWindingConsistent"],
            "bounds": {
                "min": bounds[0].tolist(),
                "max": bounds[1].tolist(),
            },
            "dimensions": _dimension_object(dimensions),
            "volumeApproxMm3": volume_approx,
        },
        "triangleCount": int(len(mesh.faces)),
        "vertexCount": int(len(mesh.vertices)),
        "bounds": bounds_payload,
        "dimensions": dimensions,
        "volumeApprox": volume_approx,
        "validation": validation,
        "machinability": machinability,
        "warnings": warnings,
        "errors": errors,
        "thesisFriendlyStatus": status,
        "processingTimeSeconds": round(time.perf_counter() - start, 4),
        "transformApplied": transform.model_dump(mode="json"),
    }
