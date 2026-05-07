"use client"

import { Settings2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MachiningParams } from "@/features/gcoder/api/gcoderClient"

type Props = {
  params: MachiningParams
  disabled?: boolean
  onChange: (params: MachiningParams) => void
}

const numericFields: Array<{
  key: keyof MachiningParams
  label: string
  step: string
}> = [
  { key: "tool_diameter_mm", label: "Herramienta (mm)", step: "0.001" },
  { key: "step_down_mm", label: "Profundidad/pasada", step: "0.1" },
  { key: "step_over_mm", label: "Stepover", step: "0.1" },
  { key: "feed_rate_mm_min", label: "Avance XY", step: "10" },
  { key: "plunge_rate_mm_min", label: "Avance Z", step: "10" },
  { key: "spindle_rpm", label: "RPM", step: "100" },
  { key: "safe_z_mm", label: "Z seguro", step: "0.1" },
  { key: "stock_margin_mm", label: "Margen XY", step: "0.1" },
]

export default function MachiningParametersForm({ params, disabled, onChange }: Props) {
  const updateNumber = (key: keyof MachiningParams, value: string) => {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      onChange({ ...params, [key]: parsed })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Parámetros CNC</h4>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {numericFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{field.label}</Label>
            <Input
              disabled={disabled}
              type="number"
              min="0"
              step={field.step}
              value={String(params[field.key])}
              onChange={(event) => updateNumber(field.key, event.target.value)}
              className="h-9"
            />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Estrategia</Label>
          <select
            disabled={disabled}
            value={params.strategy}
            onChange={(event) => onChange({ ...params, strategy: event.target.value as MachiningParams["strategy"] })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="positive_part_external">Pieza positiva exterior</option>
            <option value="contour_parallel">Contour parallel</option>
            <option value="contour">Contour</option>
            <option value="zigzag">Zigzag</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Origen</Label>
          <select
            disabled={disabled}
            value={params.origin}
            onChange={(event) => onChange({ ...params, origin: event.target.value as MachiningParams["origin"] })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="bottom_left">Bottom left</option>
            <option value="center">Center</option>
          </select>
        </div>
      </div>
    </div>
  )
}
