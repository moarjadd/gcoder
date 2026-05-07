export function downloadTextFile(filename: string, content: string, type = "text/plain") {
  const anchor = document.createElement("a")
  anchor.href = URL.createObjectURL(new Blob([content], { type }))
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(anchor.href)
}
