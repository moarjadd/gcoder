export type MachiningParams = {
  tool_diameter_mm: number
  step_down_mm: number
  step_over_mm: number
  feed_rate_mm_min: number
  plunge_rate_mm_min: number
  spindle_rpm: number
  safe_z_mm: number
  stock_margin_mm: number
  strategy: "positive_part_external" | "contour" | "zigzag" | "contour_parallel"
  tolerance_mm: number
  origin: "bottom_left" | "center"
  units: "mm"
}
