import numpy as np
import trimesh

from app.schemas.transforms import ModelTransform


def _rotation_matrix(transform: ModelTransform) -> np.ndarray:
    matrix = trimesh.transformations.euler_matrix(
        np.deg2rad(transform.rotation_x_deg),
        np.deg2rad(transform.rotation_y_deg),
        np.deg2rad(transform.rotation_z_deg),
        axes="sxyz",
    )
    return matrix


def normalize_mesh_to_cnc_coordinates(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    normalized = mesh.copy()
    if len(normalized.vertices) == 0:
        return normalized

    bounds = np.asarray(normalized.bounds, dtype=float)
    translation = np.array([-bounds[0][0], -bounds[0][1], -bounds[0][2]], dtype=float)
    normalized.apply_translation(translation)
    normalized.remove_unreferenced_vertices()
    return normalized


def apply_model_transform(mesh: trimesh.Trimesh, transform: ModelTransform | None = None) -> trimesh.Trimesh:
    transform = transform or ModelTransform()
    transformed = mesh.copy()
    transformed.apply_scale(float(transform.scale))
    transformed.apply_transform(_rotation_matrix(transform))
    transformed = normalize_mesh_to_cnc_coordinates(transformed)
    return transformed
