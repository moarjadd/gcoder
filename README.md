# G-Coder

Conversor de archivos **STL → G-code** para **CNC Router de 3 ejes**, con análisis de fabricabilidad y vista previa 3D interactiva.

---

## 🧩 Descripción

G-Coder es una aplicación web construida con **Next.js + React** que toma un modelo 3D en formato **STL**, evalúa si es fabricable en una CNC de 3 ejes y genera automáticamente el **G-code** correspondiente.  
Incluye un visor 3D en el navegador para revisar el modelo antes de exportar el código.

---

## ✨ Características

- 📁 Carga de archivos **STL** (drag & drop o selector de archivos).
- 🧠 **Análisis de convexidad y fabricabilidad** (undercuts, base plana, etc.).
- 🧱 **Vista previa 3D** con rotación, zoom y medidas aproximadas (X, Y, Z).
- 🧾 **Generación de G-code** top-down para CNC Router de 3 ejes.
- 🐞 Modo **debug** con detalles crudos del análisis (validación).

---

## 🛠️ Tecnologías

- **Frontend**: Next.js, React, TypeScript  
- **3D**: React-Three-Fiber, Drei, Three.js  
- **Estilos**: Tailwind CSS  

---

## 🚀 Cómo ejecutarlo

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run dev

# Build de producción
npm run build
npm start
