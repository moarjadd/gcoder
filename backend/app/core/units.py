def clean_mm(value: float, precision: int = 3) -> float:
    """Normalize machine coordinates and avoid unsafe-looking -0.000 output."""

    threshold = 0.5 * (10 ** -precision)
    return 0.0 if abs(value) < threshold else float(value)


def format_mm(value: float, precision: int = 3) -> str:
    return f"{clean_mm(value, precision):.{precision}f}"
