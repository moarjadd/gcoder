import trimesh
import pytest

from app.core.slicer import _slice_levels, slice_mesh
from app.core.toolpath import generate_toolpaths
from app.schemas.machining import MachiningParams


def test_slicer_creates_layers_for_box():
    mesh = trimesh.creation.box(extents=(10, 10, 4))
    params = MachiningParams(step_down_mm=1.0)

    result = slice_mesh(mesh, params)

    assert len(result["layers"]) >= 3
    assert all(layer["contours"] for layer in result["layers"])


@pytest.mark.parametrize(
    ("height", "step_down", "expected_machine_z"),
    [
        (17.0, 1.7, [-1.7, -3.4, -5.1, -6.8, -8.5, -10.2, -11.9, -13.6, -15.3, -17.0]),
        (10.0, 3.0, [-3.0, -6.0, -9.0, -10.0]),
        (8.5, 2.0, [-2.0, -4.0, -6.0, -8.0, -8.5]),
    ],
)
def test_slice_levels_reach_full_model_height(height, step_down, expected_machine_z):
    min_z = 0.0
    max_z = height

    levels = _slice_levels(min_z, max_z, step_down, tolerance=0.1)
    machine_z = [round(z - max_z, 3) for z in levels]

    assert machine_z == expected_machine_z
    assert levels[-1] == min_z
    assert machine_z[-1] == -height
    assert len(levels) == len(set(round(level, 6) for level in levels))


def test_slice_mesh_last_layer_is_min_z_and_no_duplicate_layers():
    height = 17.0
    mesh = trimesh.creation.box(extents=(20, 20, height))
    mesh.apply_translation((0, 0, height / 2.0))
    params = MachiningParams(step_down_mm=1.7)

    result = slice_mesh(mesh, params)
    layers = result["layers"]

    assert layers[-1]["modelZ"] == pytest.approx(mesh.bounds[0][2])
    assert layers[-1]["machineZ"] == pytest.approx(-(mesh.bounds[1][2] - mesh.bounds[0][2]))
    assert min(layer["machineZ"] for layer in layers) == pytest.approx(-height)
    assert len(layers) == len({layer["modelZ"] for layer in layers})


def test_toolpath_moves_do_not_go_below_model_base():
    height = 10.0
    mesh = trimesh.creation.box(extents=(20, 20, height))
    mesh.apply_translation((0, 0, height / 2.0))
    params = MachiningParams(step_down_mm=3.0)

    slicing = slice_mesh(mesh, params)
    toolpath = generate_toolpaths(slicing, params)
    z_values = [move["z"] for move in toolpath.moves if "z" in move]

    assert min(z_values) == pytest.approx(-height)
    assert all(z >= -height for z in z_values)
