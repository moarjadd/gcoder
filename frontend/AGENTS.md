# AGENTS.md

## Proyecto

G-Coder es una aplicación web para cargar archivos STL, analizar su fabricabilidad y generar G-code para máquinas CNC Router de 3 ejes.

El objetivo del proyecto es evolucionar el prototipo actual hacia una versión más sólida para tesis, manteniendo una arquitectura clara, modular y técnicamente defendible.

## Contexto de tesis

El proyecto forma parte de una tesis sobre:

> Conversión automática de modelos 3D en formato STL a G-code para máquinas CNC Router de 3 ejes.

El sistema no debe presentarse como un CAM industrial completo. El alcance correcto es:

> Conversión de modelos STL compatibles con mecanizado vertical en CNC Router de 3 ejes, con análisis de fabricabilidad, generación básica de trayectorias, vista previa 3D y exportación de G-code.

## Stack actual

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS

Visualización 3D:

- Three.js
- React-Three-Fiber
- Drei

## Objetivo técnico general

Transformar el proyecto actual en una aplicación más robusta que incluya:

1. Parser STL unificado.
2. Validación básica de malla.
3. Análisis de fabricabilidad para CNC Router de 3 ejes.
4. Convención de coordenadas CNC correcta.
5. Parámetros configurables de máquina, herramienta, corte y material.
6. Slicing por capas.
7. Generación de trayectorias básicas.
8. Generación de G-code.
9. Vista previa de toolpath.
10. Métricas de conversión útiles para la tesis.
11. Base preparada para futura compensación de herramienta.

## Comandos del proyecto

Usar `npm` salvo que el proyecto indique otra cosa.

Instalación:

```bash
npm install