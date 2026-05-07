from io import BytesIO

import trimesh
from fastapi import HTTPException, UploadFile


def _as_trimesh(loaded):
    if isinstance(loaded, trimesh.Scene):
        meshes = [geom for geom in loaded.geometry.values() if isinstance(geom, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("El archivo STL no contiene geometría triangular.")
        return trimesh.util.concatenate(meshes)
    if isinstance(loaded, trimesh.Trimesh):
        return loaded
    raise ValueError("El archivo no pudo interpretarse como una malla STL.")


def load_mesh_from_bytes(contents: bytes, filename: str = "modelo.stl") -> trimesh.Trimesh:
    if not filename.lower().endswith(".stl"):
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Por ahora el sistema solo acepta archivos STL.",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="El archivo STL no contiene una malla válida para conversión.",
        )

    try:
        loaded = trimesh.load(BytesIO(contents), file_type="stl", force="mesh")
        mesh = _as_trimesh(loaded)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="El archivo STL no contiene una malla válida para conversión.",
        ) from exc

    if mesh is None or len(mesh.faces) == 0 or len(mesh.vertices) == 0:
        raise HTTPException(
            status_code=400,
            detail="El archivo STL no contiene una malla válida para conversión.",
        )

    mesh.remove_unreferenced_vertices()
    return mesh


async def load_mesh_from_upload(file: UploadFile) -> trimesh.Trimesh:
    return load_mesh_from_bytes(await file.read(), file.filename or "modelo.stl")
