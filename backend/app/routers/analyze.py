from fastapi import APIRouter, UploadFile, File, Form
from app.core.mesh_loader import load_mesh_from_bytes
from app.routers._form import parse_model_transform
from app.schemas.responses import AnalyzeResponse
from app.services.analysis_service import analyze_mesh

router = APIRouter(tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_stl(file: UploadFile = File(...), transform: str | None = Form(default=None)):
    contents = await file.read()
    filename = file.filename or "modelo.stl"
    mesh = load_mesh_from_bytes(contents, filename)
    return analyze_mesh(mesh, filename, len(contents), parse_model_transform(transform))
