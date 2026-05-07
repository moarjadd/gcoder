import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from app.core.mesh_loader import load_mesh_from_upload
from app.routers._form import parse_model_transform
from app.schemas.machining import MachiningParams
from app.schemas.responses import ConvertResponse
from app.services.conversion_service import convert_mesh

router = APIRouter(tags=["convert"])


@router.post("/convert", response_model=ConvertResponse)
async def convert_stl(
    file: UploadFile = File(...),
    params: str | None = Form(default=None),
    transform: str | None = Form(default=None),
):
    try:
        machining_params = MachiningParams.model_validate(json.loads(params) if params else {})
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="El campo params debe ser JSON válido.") from exc
    except ValidationError as exc:
        detail = "; ".join(error["msg"] for error in exc.errors())
        raise HTTPException(status_code=422, detail=f"Parámetros de mecanizado inválidos: {detail}") from exc

    mesh = await load_mesh_from_upload(file)
    return convert_mesh(mesh, file.filename or "modelo.stl", machining_params, parse_model_transform(transform))
