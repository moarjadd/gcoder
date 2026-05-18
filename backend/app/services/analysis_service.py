from app.core.metrics import elapsed_ms, format_duration_ms, now_seconds
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


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in items if item))


def _classification_diagnostics(validation: dict, machinability: dict, warnings: list[str]) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if validation["errors"]:
        reasons.extend(validation.get("errorCodes", []))
        reasons.append("validation_errors_present")
        return "NO_APTO_MALLA_INVALIDA", _unique(reasons)
    if machinability["errors"] or not machinability["isThreeAxisMachinable"]:
        reasons.extend(machinability.get("errorCodes", []))
        reasons.extend(machinability.get("warningCodes", []))
        if machinability["errors"]:
            reasons.append("machinability_errors_present")
        if machinability.get("hasPotentialUndercuts"):
            reasons.append("potential_undercuts_detected")
        if not machinability.get("isThreeAxisMachinable"):
            reasons.append("three_axis_machinability_failed")
        return "NO_APTO_POR_GEOMETRIA", _unique(reasons)
    if warnings:
        reasons.extend(validation.get("warningCodes", []))
        reasons.extend(machinability.get("warningCodes", []))
        reasons.append("warnings_present")
        return "APTO_CON_ADVERTENCIAS", _unique(reasons)
    return "APTO_PARA_CONVERSION", []


def _diagnostic_payload(validation: dict, machinability: dict) -> dict:
    validation_thresholds = validation.get("thresholdValues", {})
    validation_measured = validation.get("measuredValues", {})
    machinability_thresholds = machinability.get("thresholdValues", {})
    machinability_measured = machinability.get("measuredValues", {})
    threshold_values = {**validation_thresholds, **machinability_thresholds}
    measured_values = {**validation_measured, **machinability_measured}
    warning_details = {
        "convexity_ratio": machinability_measured.get("convexity_ratio"),
        "convexity_threshold": machinability_thresholds.get("convexity_ratio_threshold"),
        "is_watertight": validation.get("isWatertight"),
        "is_winding_consistent": validation.get("isWindingConsistent"),
        "concavity_detected": machinability_measured.get("concavity_detected", False),
        "detail_loss_risk": False,
        "geometry_preservation_warning": False,
        "underside_area_ratio": machinability_measured.get("underside_area_ratio"),
        "underside_area_ratio_threshold": machinability_thresholds.get("underside_area_ratio_threshold"),
        "complex_column_ratio": machinability_measured.get("complex_column_ratio"),
        "complex_column_ratio_threshold": machinability_thresholds.get("complex_column_ratio_threshold"),
        "accessibility_score": machinability_measured.get("accessibility_score"),
        "accessibility_score_threshold": machinability_thresholds.get("accessibility_score_threshold"),
        "base_flatness_score": machinability_measured.get("base_flatness_score"),
        "base_flatness_warning_threshold": machinability_thresholds.get("base_flatness_warning_threshold"),
        "degenerate_faces_count": validation.get("degenerateFacesCount", 0),
    }
    return {
        "warning_codes": _unique(validation.get("warningCodes", []) + machinability.get("warningCodes", [])),
        "warning_details": warning_details,
        "machinability_debug": machinability.get("debug", {}),
        "threshold_values": threshold_values,
        "measured_values": measured_values,
    }


def analyze_mesh(
    mesh,
    filename: str,
    file_size_bytes: int = 0,
    transform: ModelTransform | None = None,
    mesh_load_ms: float = 0.0,
    started_at: float | None = None,
    apply_transform: bool = True,
) -> dict:
    operation_start = started_at or now_seconds()
    transform = transform or ModelTransform()

    transform_start = now_seconds()
    if apply_transform:
        mesh = apply_model_transform(mesh, transform)
    transform_ms = elapsed_ms(transform_start)

    validation_start = now_seconds()
    validation = validate_mesh(mesh)
    validation_ms = elapsed_ms(validation_start)

    machinability_start = now_seconds()
    machinability = analyze_machinability(mesh, validation)
    machinability_ms = elapsed_ms(machinability_start)

    metrics_start = now_seconds()
    warnings = validation["warnings"] + machinability["warnings"]
    errors = validation["errors"] + machinability["errors"]
    bounds = mesh.bounds
    dimensions = (bounds[1] - bounds[0]).tolist()
    volume_approx = float(abs(mesh.volume)) if mesh.is_watertight else None
    bounds_payload = {
        "min": bounds[0].tolist(),
        "max": bounds[1].tolist(),
        "size": dimensions,
    }
    metrics_ms = elapsed_ms(metrics_start)

    classification_start = now_seconds()
    status, classification_reasons = _classification_diagnostics(validation, machinability, warnings)
    classification_ms = elapsed_ms(classification_start)

    diagnostics = _diagnostic_payload(validation, machinability)
    analysis_total_ms = elapsed_ms(operation_start)

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
        "classification_reasons": classification_reasons,
        **diagnostics,
        "processingTimeSeconds": round(analysis_total_ms / 1000.0, 4),
        "analysis_total_ms": analysis_total_ms,
        "mesh_load_ms": round(float(mesh_load_ms), 3),
        "transform_ms": transform_ms,
        "validation_ms": validation_ms,
        "metrics_ms": metrics_ms,
        "machinability_ms": machinability_ms,
        "classification_ms": classification_ms,
        "analysis_total_human": format_duration_ms(analysis_total_ms),
        "transformApplied": transform.model_dump(mode="json"),
    }
