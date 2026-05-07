import trimesh

from app.core.slicer import slice_mesh
from app.schemas.machining import MachiningParams


def test_slicer_creates_layers_for_box():
    mesh = trimesh.creation.box(extents=(10, 10, 4))
    params = MachiningParams(step_down_mm=1.0)

    result = slice_mesh(mesh, params)

    assert len(result["layers"]) >= 3
    assert all(layer["contours"] for layer in result["layers"])
