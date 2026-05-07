export type STLFileLite = { file: File; name: string; size: number }

export const fileToArrayBuffer = (file: File) => file.arrayBuffer()
