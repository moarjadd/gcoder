import * as THREE_NS from "three";

// Reusa la instancia si ya existe
const THREE = (globalThis as any).__THREE_SINGLETON__ ?? THREE_NS;
(globalThis as any).__THREE_SINGLETON__ = THREE;

export default THREE;
export * from "three"; // re-exporta tipos y utilidades (Box3, Vector3, etc.)
