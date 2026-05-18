from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ThesisStatus = Literal[
    "APTO_PARA_CONVERSION",
    "APTO_CON_ADVERTENCIAS",
    "NO_APTO_MALLA_INVALIDA",
    "NO_APTO_POR_GEOMETRIA",
]


class DimensionsResponse(BaseModel):
    x: float
    y: float
    z: float


class MeshSummaryResponse(BaseModel):
    triangleCount: int
    vertexCount: int
    isEmpty: bool
    isWatertight: bool
    isWindingConsistent: bool
    bounds: dict[str, list[float] | None]
    dimensions: DimensionsResponse
    volumeApproxMm3: float | None


class MeshValidationResponse(BaseModel):
    isWatertight: bool
    isWindingConsistent: bool
    isEmpty: bool
    faceCount: int
    vertexCount: int
    degenerateFacesCount: int
    bounds: dict[str, list[float] | None]
    dimensions: list[float]
    warnings: list[str]
    errors: list[str]
    isValid: bool
    warningCodes: list[str] = Field(default_factory=list)
    errorCodes: list[str] = Field(default_factory=list)
    thresholdValues: dict[str, Any] = Field(default_factory=dict)
    measuredValues: dict[str, Any] = Field(default_factory=dict)


class MachinabilityResponse(BaseModel):
    isThreeAxisMachinable: bool
    isLikelyConvex: bool
    hasPotentialUndercuts: bool
    accessibilityScore: float
    baseFlatnessScore: float
    warnings: list[str]
    errors: list[str]
    explanation: str
    details: dict[str, Any] = Field(default_factory=dict)
    warningCodes: list[str] = Field(default_factory=list)
    errorCodes: list[str] = Field(default_factory=list)
    thresholdValues: dict[str, Any] = Field(default_factory=dict)
    measuredValues: dict[str, Any] = Field(default_factory=dict)
    debug: dict[str, Any] = Field(default_factory=dict)


class ModelTransformResponse(BaseModel):
    rotation_x_deg: float
    rotation_y_deg: float
    rotation_z_deg: float
    scale: float


class AnalyzeResponse(BaseModel):
    filename: str
    fileSizeBytes: int
    mesh: MeshSummaryResponse
    triangleCount: int
    vertexCount: int
    bounds: dict[str, list[float]]
    dimensions: list[float]
    volumeApprox: float | None
    validation: MeshValidationResponse
    machinability: MachinabilityResponse
    warnings: list[str]
    errors: list[str]
    thesisFriendlyStatus: ThesisStatus
    classification_reasons: list[str] = Field(default_factory=list)
    warning_codes: list[str] = Field(default_factory=list)
    warning_details: dict[str, Any] = Field(default_factory=dict)
    machinability_debug: dict[str, Any] = Field(default_factory=dict)
    threshold_values: dict[str, Any] = Field(default_factory=dict)
    measured_values: dict[str, Any] = Field(default_factory=dict)
    processingTimeSeconds: float
    analysis_total_ms: float
    mesh_load_ms: float
    transform_ms: float
    validation_ms: float
    metrics_ms: float
    machinability_ms: float
    classification_ms: float
    analysis_total_human: str
    transformApplied: ModelTransformResponse


class ConversionReport(BaseModel):
    conversionSuccess: bool
    processingTimeSeconds: float
    layersCount: int
    toolpathMovesCount: int
    warnings: list[str]
    anomalies: list[str]
    metrics: dict[str, Any]
    model_name: str
    status: str
    layer_count: int
    toolpath_move_count: int
    gcode_line_count: int
    processing_time_seconds: float
    parameters_used: dict[str, Any]
    classification_reasons: list[str] = Field(default_factory=list)
    warning_codes: list[str] = Field(default_factory=list)
    warning_details: dict[str, Any] = Field(default_factory=dict)
    threshold_values: dict[str, Any] = Field(default_factory=dict)
    measured_values: dict[str, Any] = Field(default_factory=dict)
    machining_semantics: str
    stock_margin_mm: float
    tool_radius_mm: float
    uses_internal_pocket: bool
    convex_hull_fallback_used: bool
    slicing_fallback_used: bool
    geometry_preservation_warning: bool
    concavity_detected: bool
    concavity_preserved: bool
    detail_loss_risk: bool
    lost_holes_detected: bool
    geometry_repair_used: bool
    rmse_mm: float | None
    max_error_mm: float | None
    mean_error_mm: float | None
    area_error_percent: float | None
    compared_layers: int
    skipped_layers: int
    hole_preservation_rate: float | None
    total_holes_detected: int
    total_holes_preserved: int
    layer_geometry_warnings: list[str]
    model_dimensions_mm: DimensionsResponse
    algorithm_stock_mm: DimensionsResponse
    recommended_physical_stock_mm: DimensionsResponse
    stock_margin_xy_mm: float
    recommended_margin_xy_mm: float
    recommended_extra_z_mm: float
    tool_diameter_mm: float
    skipped_layers_count: int
    invalid_toolpath_layers_count: int
    work_origin_assumption: str
    z_zero_assumption: str
    stock_notes: list[str]
    estimated_offset_passes_per_layer: int
    estimated_operation_complexity: int
    recommended_max_layers: int
    estimated_layer_count: int
    step_down_layer_warning: bool
    step_over_offset_warning: bool
    conversion_total_ms: float
    mesh_load_ms: float
    transform_ms: float
    analysis_ms: float
    slicing_ms: float
    toolpath_ms: float
    postprocess_ms: float
    metrics_ms: float
    conversion_total_human: str
    slicing_human: str
    toolpath_human: str
    postprocess_human: str


class ConvertResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: str
    filename: str
    gcode: str
    linesCount: int
    estimatedSummary: dict[str, Any]
    report: ConversionReport
    transformApplied: ModelTransformResponse
