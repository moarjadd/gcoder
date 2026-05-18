from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class ToolpathStrategy(str, Enum):
    positive_part_external = "positive_part_external"
    contour = "contour"
    zigzag = "zigzag"
    contour_parallel = "contour_parallel"


class WorkOrigin(str, Enum):
    bottom_left = "bottom_left"
    center = "center"


class Units(str, Enum):
    mm = "mm"


class MachiningParams(BaseModel):
    tool_diameter_mm: float = Field(default=3.0, gt=0)
    step_down_mm: float = Field(default=1.0, gt=0)
    step_over_mm: float = Field(default=1.5, gt=0)
    feed_rate_mm_min: float = Field(default=800, gt=0)
    plunge_rate_mm_min: float = Field(default=200, gt=0)
    spindle_rpm: int = Field(default=12000, ge=0)
    safe_z_mm: float = Field(default=5.0, gt=0)
    stock_margin_mm: float = Field(default=6.0, ge=0)
    strategy: ToolpathStrategy = ToolpathStrategy.positive_part_external
    tolerance_mm: float = Field(default=0.1, gt=0)
    origin: WorkOrigin = WorkOrigin.bottom_left
    units: Units = Units.mm

    @field_validator("step_over_mm")
    @classmethod
    def step_over_should_not_exceed_tool(cls, value: float, info):
        tool = info.data.get("tool_diameter_mm")
        if tool and value > tool:
            raise ValueError("El stepover no debe ser mayor que el diámetro de la herramienta.")
        return value

    @model_validator(mode="after")
    def positive_part_strategy_needs_external_stock(self):
        if self.strategy == ToolpathStrategy.positive_part_external and self.stock_margin_mm <= self.tool_diameter_mm:
            raise ValueError(
                "stock_margin_mm debe ser mayor que el diámetro de la herramienta para mecanizado exterior de pieza positiva."
            )
        return self
