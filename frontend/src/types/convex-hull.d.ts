declare module "convex-hull" {
  type Point = number[]   // [x, y, z] etc.
  type Face = number[]    // índices de puntos

  const convexHull: (points: Point[]) => Face[]
  export default convexHull
}