import json

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.transforms import ModelTransform


def parse_model_transform(transform: str | None) -> ModelTransform:
    try:
        return ModelTransform.model_validate(json.loads(transform) if transform else {})
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="El campo transform debe ser JSON válido.") from exc
    except ValidationError as exc:
        detail = "; ".join(error["msg"] for error in exc.errors())
        raise HTTPException(status_code=422, detail=f"Transformación de modelo inválida: {detail}") from exc
