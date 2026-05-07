from pydantic import BaseModel, Field, field_validator


def normalize_degrees(value: float) -> float:
    normalized = float(value) % 360.0
    return 0.0 if abs(normalized) < 1e-9 else normalized


class ModelTransform(BaseModel):
    rotation_x_deg: float = 0.0
    rotation_y_deg: float = 0.0
    rotation_z_deg: float = 0.0
    scale: float = Field(default=1.0, gt=0)

    @field_validator("rotation_x_deg", "rotation_y_deg", "rotation_z_deg")
    @classmethod
    def normalize_rotation(cls, value: float) -> float:
        return normalize_degrees(value)
