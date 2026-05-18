import math

from fastapi import HTTPException

from app.core.metrics import compute_metrics, elapsed_ms, format_duration_ms, now_seconds
from app.core.postprocessor import generate_gcode
from app.core.slicer import slice_mesh
from app.core.toolpath import generate_toolpaths
from app.schemas.machining import MachiningParams
from app.schemas.transforms import ModelTransform
from app.services.analysis_service import analyze_mesh
from app.core.transforms import apply_model_transform


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in items if item))


def _estimate_operation_complexity(slicing: dict, params: MachiningParams) -> dict:
    bounds = slicing["modelBounds"]
    mins = bounds["min"]
    maxs = bounds["max"]
    span_x = max(0.0, float(maxs[0]) - float(mins[0]) + (2.0 * float(params.stock_margin_mm)))
    span_y = max(0.0, float(maxs[1]) - float(mins[1]) + (2.0 * float(params.stock_margin_mm)))
    max_span = max(span_x, span_y)
    estimated_offset_passes = max(1, int(math.ceil(max_span / max(float(params.step_over_mm), float(params.tolerance_mm)))))
    layer_count = int(len(slicing["layers"]))
    estimated_operation_complexity = int(layer_count * estimated_offset_passes)
    return {
        "estimated_offset_passes_per_layer": estimated_offset_passes,
        "estimated_operation_complexity": estimated_operation_complexity,
        "recommended_max_layers": int(slicing.get("recommendedMaxLayers", 250)),
        "estimated_layer_count": int(slicing.get("estimatedLayerCount", layer_count)),
        "step_down_layer_warning": bool(
            slicing.get("estimatedLayerCount", layer_count) > slicing.get("recommendedMaxLayers", 250)
        ),
        "step_over_offset_warning": bool(estimated_offset_passes > 250),
    }


def convert_mesh(
    mesh,
    filename: str,
    params: MachiningParams,
    transform: ModelTransform | None = None,
    mesh_load_ms: float = 0.0,
    started_at: float | None = None,
) -> dict:
    start = started_at or now_seconds()
    transform = transform or ModelTransform()

    transform_start = now_seconds()
    mesh = apply_model_transform(mesh, transform)
    transform_ms = elapsed_ms(transform_start)

    analysis_start = now_seconds()
    analysis = analyze_mesh(mesh, filename, transform=ModelTransform(), apply_transform=False)
    analysis_ms = elapsed_ms(analysis_start)
    warnings = list(analysis["warnings"])
    warning_codes = list(analysis.get("warning_codes", []))
    anomalies: list[str] = []

    if not analysis["validation"]["isValid"]:
        raise HTTPException(
            status_code=422,
            detail="El archivo STL no contiene una malla válida para conversión.",
        )

    if not analysis["machinability"]["isThreeAxisMachinable"]:
        raise HTTPException(
            status_code=422,
            detail="El modelo no parece compatible con mecanizado CNC router de 3 ejes.",
        )

    slicing_start = now_seconds()
    slicing = slice_mesh(mesh, params)
    slicing_ms = elapsed_ms(slicing_start)
    if not slicing["layers"]:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        )
    complexity = _estimate_operation_complexity(slicing, params)
    if complexity["step_down_layer_warning"]:
        warning_codes.append("too_many_slicing_layers")
    if complexity["step_over_offset_warning"]:
        warnings.append(
            f"step_over_mm={params.step_over_mm:.4f} puede generar demasiados offsets por capa; "
            "el toolpath puede tardar mucho."
        )
        warning_codes.append("too_many_toolpath_offsets")

    toolpath_start = now_seconds()
    toolpath = generate_toolpaths(slicing, params)
    toolpath_ms = elapsed_ms(toolpath_start)
    warnings.extend(toolpath.warnings)
    warning_codes.extend(toolpath.warning_codes)
    anomalies.extend(toolpath.anomalies)

    if not toolpath.moves:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        )

    try:
        postprocess_start = now_seconds()
        gcode = generate_gcode({"moves": toolpath.moves}, params, filename)
        postprocess_ms = elapsed_ms(postprocess_start)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        ) from exc

    metrics_start = now_seconds()
    metrics = compute_metrics(
        start,
        toolpath.moves,
        gcode,
        len(slicing["layers"]),
        warnings,
        anomalies,
        precision_layers=toolpath.precision_layers,
        tolerance_mm=params.tolerance_mm,
    )
    metrics_ms = elapsed_ms(metrics_start)
    if metrics.get("hole_preservation_rate") is not None and metrics["hole_preservation_rate"] < 1.0:
        message = (
            "La preservación de huecos internos es incompleta; revisa diámetro de herramienta "
            "y advertencias de geometría por capa."
        )
        if message not in warnings:
            warnings.append(message)
        warning_codes.append("HOLE_PRESERVATION_INCOMPLETE")
    if metrics.get("rmse_mm") is None:
        warning_codes.append("DIMENSIONAL_PRECISION_NOT_COMPUTED")
    warning_codes.extend(metrics.get("layer_geometry_warnings", []))
    metrics["warnings_count"] = len(warnings)
    metrics["anomalies_count"] = len(anomalies)

    machining_metadata = {
        "machining_semantics": toolpath.machining_semantics,
        "stock_margin_mm": toolpath.stock_margin_mm,
        "tool_radius_mm": toolpath.tool_radius_mm,
        "uses_internal_pocket": toolpath.uses_internal_pocket,
        "convex_hull_fallback_used": toolpath.convex_hull_fallback_used,
        "slicing_fallback_used": toolpath.slicing_fallback_used,
        "geometry_preservation_warning": toolpath.geometry_preservation_warning,
        "concavity_detected": toolpath.concavity_detected,
        "concavity_preserved": toolpath.concavity_preserved,
        "detail_loss_risk": toolpath.detail_loss_risk,
        "lost_holes_detected": toolpath.lost_holes_detected or bool(slicing.get("lostHolesDetected", False)),
        "geometry_repair_used": bool(slicing.get("geometryRepairUsed", False)),
        "total_holes_detected": metrics.get("total_holes_detected", toolpath.total_holes_detected),
        "total_holes_preserved": metrics.get("total_holes_preserved", toolpath.total_holes_preserved),
        "hole_preservation_rate": metrics.get("hole_preservation_rate", toolpath.hole_preservation_rate),
        "layer_geometry_warnings": list(
            dict.fromkeys(
                list(toolpath.layer_geometry_warnings)
                + list(slicing.get("layerGeometryWarnings", []))
                + list(metrics.get("layer_geometry_warnings", []))
            )
        ),
        "rmse_mm": metrics.get("rmse_mm"),
        "max_error_mm": metrics.get("max_error_mm"),
        "mean_error_mm": metrics.get("mean_error_mm"),
        "area_error_percent": metrics.get("area_error_percent"),
        "compared_layers": metrics.get("compared_layers", 0),
        "skipped_layers": metrics.get("skipped_layers", 0),
        "tool_diameter_mm": params.tool_diameter_mm,
        "skipped_layers_count": toolpath.skipped_layers_count,
        "invalid_toolpath_layers_count": toolpath.invalid_toolpath_layers_count,
        **complexity,
    }
    metrics.update(machining_metadata)
    threshold_values = {
        **analysis.get("threshold_values", {}),
        **toolpath.threshold_values,
        "max_recommended_layers": complexity["recommended_max_layers"],
        "max_recommended_offset_passes_per_layer": 250,
    }
    measured_values = {
        **analysis.get("measured_values", {}),
        **toolpath.measured_values,
        **complexity,
    }
    warning_details = {
        **analysis.get("warning_details", {}),
        "convex_hull_fallback_used": toolpath.convex_hull_fallback_used,
        "slicing_fallback_used": toolpath.slicing_fallback_used,
        "concavity_preserved": toolpath.concavity_preserved,
        "detail_loss_risk": toolpath.detail_loss_risk,
        "geometry_preservation_warning": toolpath.geometry_preservation_warning,
        "estimated_operation_complexity": complexity["estimated_operation_complexity"],
        "estimated_offset_passes_per_layer": complexity["estimated_offset_passes_per_layer"],
        "estimated_layer_count": complexity["estimated_layer_count"],
        "recommended_max_layers": complexity["recommended_max_layers"],
        "rmse_mm": metrics.get("rmse_mm"),
        "max_error_mm": metrics.get("max_error_mm"),
        "mean_error_mm": metrics.get("mean_error_mm"),
        "area_error_percent": metrics.get("area_error_percent"),
        "hole_preservation_rate": metrics.get("hole_preservation_rate"),
        "total_holes_detected": metrics.get("total_holes_detected"),
        "total_holes_preserved": metrics.get("total_holes_preserved"),
        "layer_geometry_warnings": machining_metadata["layer_geometry_warnings"],
    }
    conversion_total_ms = elapsed_ms(start)
    timing_metadata = {
        "conversion_total_ms": conversion_total_ms,
        "mesh_load_ms": round(float(mesh_load_ms), 3),
        "transform_ms": transform_ms,
        "analysis_ms": analysis_ms,
        "slicing_ms": slicing_ms,
        "toolpath_ms": toolpath_ms,
        "postprocess_ms": postprocess_ms,
        "metrics_ms": metrics_ms,
        "conversion_total_human": format_duration_ms(conversion_total_ms),
        "slicing_human": format_duration_ms(slicing_ms),
        "toolpath_human": format_duration_ms(toolpath_ms),
        "postprocess_human": format_duration_ms(postprocess_ms),
    }
    metrics.update(timing_metadata)
    metrics["processing_time_seconds"] = round(conversion_total_ms / 1000.0, 4)
    lines_count = metrics["gcode_line_count"]
    parameters_used = params.model_dump(mode="json")
    report = {
        "conversionSuccess": True,
        "processingTimeSeconds": metrics["processing_time_seconds"],
        "layersCount": len(slicing["layers"]),
        "toolpathMovesCount": len(toolpath.moves),
        "warnings": warnings,
        "anomalies": anomalies,
        "metrics": metrics,
        "model_name": filename,
        "status": "success",
        "layer_count": len(slicing["layers"]),
        "toolpath_move_count": len(toolpath.moves),
        "gcode_line_count": lines_count,
        "processing_time_seconds": metrics["processing_time_seconds"],
        "parameters_used": parameters_used,
        "classification_reasons": analysis.get("classification_reasons", []),
        "warning_codes": _unique(warning_codes),
        "warning_details": warning_details,
        "threshold_values": threshold_values,
        "measured_values": measured_values,
        **machining_metadata,
        **timing_metadata,
    }

    return {
        "status": "success",
        "filename": filename,
        "gcode": gcode,
        "linesCount": lines_count,
        "estimatedSummary": {
            "layers": len(slicing["layers"]),
            "moves": len(toolpath.moves),
            "pathLengthMm": metrics["estimated_path_length_mm"],
            "note": "Estimación geométrica básica; no sustituye simulación CAM industrial.",
            **machining_metadata,
        },
        "report": report,
        "transformApplied": transform.model_dump(mode="json"),
    }
