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
    processingTimeSeconds: float
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


class ConvertResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: str
    filename: str
    gcode: str
    linesCount: int
    estimatedSummary: dict[str, Any]
    report: ConversionReport
    transformApplied: ModelTransformResponse
