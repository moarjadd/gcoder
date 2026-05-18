from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = ROOT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(REPO_DIR) not in sys.path:
    sys.path.insert(0, str(REPO_DIR))

from app.schemas.machining import MachiningParams, ToolpathStrategy
from app.schemas.transforms import ModelTransform
from app.services.analysis_service import analyze_mesh
from app.services.conversion_service import convert_mesh
from tests.stl_dataset import CONTROLLED_STL_CASES, stl_payload


REPORT_PATH = ROOT_DIR / "reports" / "batch_evaluation.json"

CASE_METADATA = {
    "cube.stl": {
        "category": "valid_convex_solid",
        "expected_behavior": "Malla valida y conversion exitosa.",
    },
    "rectangular-prism.stl": {
        "category": "valid_convex_solid",
        "expected_behavior": "Malla valida y conversion exitosa con dimensiones no uniformes.",
    },
    "cylinder.stl": {
        "category": "valid_curved_solid",
        "expected_behavior": "Malla valida y conversion exitosa para solido facetado.",
    },
    "cone.stl": {
        "category": "valid_curved_solid",
        "expected_behavior": "Malla valida y conversion exitosa con secciones variables.",
    },
    "star-prism.stl": {
        "category": "accessible_concave_solid",
        "expected_behavior": "Malla valida concava accesible desde Z; conversion con advertencias si la herramienta pierde detalle.",
    },
    "invalid-flat.stl": {
        "category": "invalid_mesh",
        "expected_behavior": "Rechazo por malla sin volumen o dimensiones utiles.",
    },
    "overhang.stl": {
        "category": "potential_undercut",
        "expected_behavior": "Rechazo por geometria potencialmente no apta para CNC router de 3 ejes.",
    },
    "semicylinder_flat_base.stl": {
        "category": "orientation_case",
        "expected_behavior": "Mejor fabricabilidad con cara plana apoyada en Z=0.",
    },
    "semicylinder_curved_base.stl": {
        "category": "orientation_case",
        "expected_behavior": "Menor fabricabilidad con superficie curva hacia la base.",
    },
}


def default_machining_params() -> MachiningParams:
    return MachiningParams(
        tool_diameter_mm=3.0,
        step_down_mm=2.0,
        step_over_mm=1.5,
        feed_rate_mm_min=800,
        plunge_rate_mm_min=200,
        spindle_rpm=12000,
        safe_z_mm=5.0,
        strategy=ToolpathStrategy.positive_part_external,
        tolerance_mm=0.1,
    )


def _analysis_payload(analysis: dict[str, Any]) -> dict[str, Any]:
    return {
        "thesisFriendlyStatus": analysis["thesisFriendlyStatus"],
        "isValid": analysis["validation"]["isValid"],
        "isThreeAxisMachinable": analysis["machinability"]["isThreeAxisMachinable"],
        "isLikelyConvex": analysis["machinability"]["isLikelyConvex"],
        "hasPotentialUndercuts": analysis["machinability"]["hasPotentialUndercuts"],
        "accessibilityScore": analysis["machinability"]["accessibilityScore"],
        "baseFlatnessScore": analysis["machinability"]["baseFlatnessScore"],
        "analysis_total_ms": analysis["analysis_total_ms"],
        "analysis_total_human": analysis["analysis_total_human"],
        "classification_reasons": analysis["classification_reasons"],
        "warning_codes": analysis["warning_codes"],
        "warning_details": analysis["warning_details"],
        "warnings": analysis["warnings"],
        "errors": analysis["errors"],
    }


def _empty_conversion(status: str, reason: str | None = None, attempted: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "attempted": attempted,
        "status": status,
        "layer_count": 0,
        "toolpath_move_count": 0,
        "gcode_line_count": 0,
        "processing_time_seconds": 0.0,
        "conversion_total_ms": 0.0,
        "conversion_total_human": "0 min 00.00 s",
        "warnings": [],
        "anomalies": [],
    }
    if reason:
        payload["reason"] = reason
    return payload


def evaluate_model(model_name: str, params: MachiningParams | None = None) -> dict[str, Any]:
    params = params or default_machining_params()
    metadata = CASE_METADATA.get(
        model_name,
        {"category": "uncategorized", "expected_behavior": "Sin comportamiento esperado documentado."},
    )
    mesh = CONTROLLED_STL_CASES[model_name]()
    payload_size = len(stl_payload(mesh))
    transform = ModelTransform()

    result: dict[str, Any] = {
        "model_name": model_name,
        "category": metadata["category"],
        "expected_behavior": metadata["expected_behavior"],
        "analysis": {},
        "conversion": _empty_conversion("not_attempted"),
        "parameters_used": params.model_dump(mode="json"),
    }

    try:
        analysis = analyze_mesh(mesh, model_name, file_size_bytes=payload_size, transform=transform)
        result["analysis"] = _analysis_payload(analysis)
        result["transformApplied"] = analysis["transformApplied"]
    except Exception as exc:
        result["analysis"] = {
            "thesisFriendlyStatus": "ERROR_ANALYSIS",
            "isValid": False,
            "isThreeAxisMachinable": False,
            "isLikelyConvex": False,
            "hasPotentialUndercuts": False,
            "accessibilityScore": 0.0,
            "baseFlatnessScore": 0.0,
            "warnings": [],
            "errors": [str(exc)],
        }
        result["conversion"] = _empty_conversion("error", str(exc), attempted=False)
        return result

    if not result["analysis"]["isValid"]:
        result["conversion"] = _empty_conversion("rejected", "Malla invalida; conversion no intentada.", attempted=False)
        return result

    if not result["analysis"]["isThreeAxisMachinable"]:
        result["conversion"] = _empty_conversion("rejected", "Geometria no apta; conversion no intentada.", attempted=False)
        return result

    try:
        conversion = convert_mesh(mesh, model_name, params, transform=transform)
        report = conversion["report"]
        result["conversion"] = {
            "attempted": True,
            "status": "success",
            "layer_count": report["layer_count"],
            "toolpath_move_count": report["toolpath_move_count"],
            "gcode_line_count": report["gcode_line_count"],
            "processing_time_seconds": report["processing_time_seconds"],
            "conversion_total_ms": report["conversion_total_ms"],
            "conversion_total_human": report["conversion_total_human"],
            "slicing_ms": report["slicing_ms"],
            "toolpath_ms": report["toolpath_ms"],
            "postprocess_ms": report["postprocess_ms"],
            "machining_semantics": report["machining_semantics"],
            "stock_margin_mm": report["stock_margin_mm"],
            "tool_diameter_mm": report["tool_diameter_mm"],
            "tool_radius_mm": report["tool_radius_mm"],
            "uses_internal_pocket": report["uses_internal_pocket"],
            "convex_hull_fallback_used": report["convex_hull_fallback_used"],
            "slicing_fallback_used": report["slicing_fallback_used"],
            "geometry_preservation_warning": report["geometry_preservation_warning"],
            "concavity_detected": report["concavity_detected"],
            "concavity_preserved": report["concavity_preserved"],
            "detail_loss_risk": report["detail_loss_risk"],
            "skipped_layers_count": report["skipped_layers_count"],
            "invalid_toolpath_layers_count": report["invalid_toolpath_layers_count"],
            "estimated_operation_complexity": report["estimated_operation_complexity"],
            "classification_reasons": report["classification_reasons"],
            "warning_codes": report["warning_codes"],
            "warning_details": report["warning_details"],
            "warnings": report["warnings"],
            "anomalies": report["anomalies"],
        }
    except HTTPException as exc:
        result["conversion"] = _empty_conversion("rejected", str(exc.detail), attempted=True)
    except Exception as exc:
        result["conversion"] = _empty_conversion("error", str(exc), attempted=True)

    return result


def build_batch_report() -> dict[str, Any]:
    params = default_machining_params()
    results = [evaluate_model(model_name, params) for model_name in CONTROLLED_STL_CASES]
    summary = {
        "analysis_ready": sum(1 for item in results if item["analysis"].get("isValid")),
        "conversion_success": sum(1 for item in results if item["conversion"]["status"] == "success"),
        "rejected": sum(1 for item in results if item["conversion"]["status"] == "rejected"),
        "errors": sum(1 for item in results if item["conversion"]["status"] == "error"),
    }
    analysis_times = [
        float(item["analysis"].get("analysis_total_ms", 0.0))
        for item in results
        if item.get("analysis") and item["analysis"].get("analysis_total_ms") is not None
    ]
    successful_conversion_times = [
        float(item["conversion"].get("conversion_total_ms", 0.0))
        for item in results
        if item["conversion"].get("status") == "success"
    ]
    timing_summary = {
        "average_analysis_total_ms": round(sum(analysis_times) / len(analysis_times), 3) if analysis_times else 0.0,
        "average_conversion_total_ms": (
            round(sum(successful_conversion_times) / len(successful_conversion_times), 3)
            if successful_conversion_times
            else 0.0
        ),
        "successful_conversion_samples": len(successful_conversion_times),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": "gcoder-v2",
        "scope": "STL-only MVP",
        "total_models": len(results),
        "summary": summary,
        "timing_summary": timing_summary,
        "results": results,
    }


def write_report(report: dict[str, Any], path: Path = REPORT_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def main() -> None:
    report = build_batch_report()
    path = write_report(report)
    print(f"Batch evaluation written to {path}")
    print(json.dumps(report["summary"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
