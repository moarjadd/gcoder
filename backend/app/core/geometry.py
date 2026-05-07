from app.schemas.machining import MachiningParams


def transform_xy_to_work_origin(
    x: float,
    y: float,
    model_bounds: dict,
    params: MachiningParams,
) -> tuple[float, float]:
    """Map STL XY coordinates into the selected CNC work coordinate origin.

    bottom_left: translate model minimum XY into positive quadrant and apply
    stock_margin_mm. center: place model center at X0/Y0 for symmetric setups.
    """

    mins = model_bounds["min"]
    maxs = model_bounds["max"]
    if params.origin == "center":
        cx = (mins[0] + maxs[0]) / 2.0
        cy = (mins[1] + maxs[1]) / 2.0
        return x - cx, y - cy
    return x - mins[0] + params.stock_margin_mm, y - mins[1] + params.stock_margin_mm
