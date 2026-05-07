import math

import trimesh
from trimesh.exchange.stl import export_stl


def cube_mesh() -> trimesh.Trimesh:
    return trimesh.creation.box(extents=(10, 10, 10))


def rectangular_prism_mesh() -> trimesh.Trimesh:
    return trimesh.creation.box(extents=(24, 12, 6))


def cylinder_mesh() -> trimesh.Trimesh:
    return trimesh.creation.cylinder(radius=5, height=8, sections=32)


def cone_mesh() -> trimesh.Trimesh:
    return trimesh.creation.cone(radius=5, height=8, sections=32)


def star_prism_mesh(outer_radius: float = 8.0, inner_radius: float = 3.5, height: float = 6.0, points: int = 5) -> trimesh.Trimesh:
    boundary = []
    for index in range(points * 2):
        radius = outer_radius if index % 2 == 0 else inner_radius
        angle = (math.pi / 2.0) + (index * math.pi / points)
        boundary.append((radius * math.cos(angle), radius * math.sin(angle)))

    half_height = height / 2.0
    vertices = [[0.0, 0.0, -half_height], [0.0, 0.0, half_height]]
    vertices.extend([x, y, -half_height] for x, y in boundary)
    vertices.extend([x, y, half_height] for x, y in boundary)

    bottom_center = 0
    top_center = 1
    bottom_start = 2
    top_start = 2 + len(boundary)
    faces = []

    for index in range(len(boundary)):
        next_index = (index + 1) % len(boundary)
        b0 = bottom_start + index
        b1 = bottom_start + next_index
        t0 = top_start + index
        t1 = top_start + next_index

        faces.append([bottom_center, b1, b0])
        faces.append([top_center, t0, t1])
        faces.append([b0, b1, t1])
        faces.append([b0, t1, t0])

    return trimesh.Trimesh(vertices=vertices, faces=faces, process=True)


def invalid_flat_mesh() -> trimesh.Trimesh:
    vertices = [
        [0.0, 0.0, 0.0],
        [10.0, 0.0, 0.0],
        [10.0, 10.0, 0.0],
        [0.0, 10.0, 0.0],
    ]
    faces = [[0, 1, 2], [0, 2, 3]]
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def overhang_mesh() -> trimesh.Trimesh:
    stem = trimesh.creation.box(extents=(6, 6, 10))
    stem.apply_translation((0, 0, 5))
    cap = trimesh.creation.box(extents=(18, 18, 4))
    cap.apply_translation((0, 0, 12))
    return trimesh.util.concatenate([stem, cap])


def semicylinder_flat_base_mesh(radius: float = 6.0, length: float = 18.0, sections: int = 32) -> trimesh.Trimesh:
    # Avoid relying on optional triangulation engines by building a fan over a
    # convex D-shaped section, then extruding it along Y.
    boundary = []
    for index in range(sections + 1):
        theta = math.pi - (math.pi * index / sections)
        boundary.append([radius * math.cos(theta), radius * math.sin(theta)])

    center_2d = [0.0, (2.0 * radius) / math.pi]
    half_length = length / 2.0
    vertices = []
    for y in (-half_length, half_length):
        vertices.append([center_2d[0], y, center_2d[1]])
        vertices.extend([x, y, z] for x, z in boundary)

    cap_stride = len(boundary) + 1
    faces = []
    for idx in range(1, len(boundary) + 1):
        next_idx = 1 if idx == len(boundary) else idx + 1
        faces.append([0, idx, next_idx])
        faces.append([cap_stride, cap_stride + next_idx, cap_stride + idx])

    for idx in range(1, len(boundary) + 1):
        next_idx = 1 if idx == len(boundary) else idx + 1
        a = idx
        b = next_idx
        c = cap_stride + next_idx
        d = cap_stride + idx
        faces.append([a, b, c])
        faces.append([a, c, d])

    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def semicylinder_curved_base_mesh() -> trimesh.Trimesh:
    mesh = semicylinder_flat_base_mesh()
    mesh.apply_transform(trimesh.transformations.rotation_matrix(3.141592653589793, [1, 0, 0]))
    return mesh


CONTROLLED_STL_CASES = {
    "cube.stl": cube_mesh,
    "rectangular-prism.stl": rectangular_prism_mesh,
    "cylinder.stl": cylinder_mesh,
    "cone.stl": cone_mesh,
    "star-prism.stl": star_prism_mesh,
    "invalid-flat.stl": invalid_flat_mesh,
    "overhang.stl": overhang_mesh,
    "semicylinder_flat_base.stl": semicylinder_flat_base_mesh,
    "semicylinder_curved_base.stl": semicylinder_curved_base_mesh,
}


def stl_payload(mesh: trimesh.Trimesh) -> bytes:
    return export_stl(mesh)
