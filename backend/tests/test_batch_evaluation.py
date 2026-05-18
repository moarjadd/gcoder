from scripts.run_batch_evaluation import build_batch_report
from tests.stl_dataset import CONTROLLED_STL_CASES


def test_batch_evaluation_report_contains_summary_and_all_controlled_models():
    report = build_batch_report()

    assert report["project"] == "gcoder-v2"
    assert report["scope"] == "STL-only MVP"
    assert report["total_models"] == len(CONTROLLED_STL_CASES)
    assert set(report["summary"]) == {"analysis_ready", "conversion_success", "rejected", "errors"}
    assert report["timing_summary"]["average_analysis_total_ms"] >= 0
    assert report["timing_summary"]["average_conversion_total_ms"] >= 0
    assert {item["model_name"] for item in report["results"]} == set(CONTROLLED_STL_CASES)
    assert any(item["conversion"]["status"] == "rejected" for item in report["results"])
    assert all("analysis" in item and "conversion" in item for item in report["results"])
