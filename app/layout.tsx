import type React from "react"
import type { Metadata, Viewport } from "next"
import { Source_Code_Pro, Geist } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-mono", // <- usa esta variable para código
  display: "swap",
})

export const metadata: Metadata = {
  title: "G-coder | STL to G-code Converter for Router CNC 3-axis",
  description: "Convert STL files to G-code with convexity analysis",
  generator: "v0.app",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${sourceCodePro.variable}`}>
      <body>{children}</body>
    </html>
  )
}
