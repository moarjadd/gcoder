from fastapi import HTTPException

from app.core.metrics import compute_metrics, now_seconds
from app.core.postprocessor import generate_gcode
from app.core.slicer import slice_mesh
from app.core.toolpath import generate_toolpaths
from app.schemas.machining import MachiningParams
from app.schemas.transforms import ModelTransform
from app.services.analysis_service import analyze_mesh
from app.core.transforms import apply_model_transform


def convert_mesh(mesh, filename: str, params: MachiningParams, transform: ModelTransform | None = None) -> dict:
    start = now_seconds()
    transform = transform or ModelTransform()
    mesh = apply_model_transform(mesh, transform)
    analysis = analyze_mesh(mesh, filename, transform=ModelTransform())
    warnings = list(analysis["warnings"])
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

    slicing = slice_mesh(mesh, params)
    if not slicing["layers"]:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        )

    toolpath = generate_toolpaths(slicing, params)
    warnings.extend(toolpath.warnings)
    anomalies.extend(toolpath.anomalies)

    if not toolpath.moves:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        )

    try:
        gcode = generate_gcode({"moves": toolpath.moves}, params, filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar el código G. Revisa las advertencias del análisis.",
        ) from exc

    metrics = compute_metrics(start, toolpath.moves, gcode, len(slicing["layers"]), warnings, anomalies)
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
        "tool_diameter_mm": params.tool_diameter_mm,
        "skipped_layers_count": toolpath.skipped_layers_count,
        "invalid_toolpath_layers_count": toolpath.invalid_toolpath_layers_count,
    }
    metrics.update(machining_metadata)
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
        **machining_metadata,
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
