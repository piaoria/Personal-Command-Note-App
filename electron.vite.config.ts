import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  main: {
    build: { lib: { entry: "electron/main/index.ts", formats: ["es"] } },
  },
  preload: {
    build: {
      lib: {
        entry: "electron/preload/index.ts",
        formats: ["cjs"],
        fileName: () => "index.cjs",
      },
    },
  },
  renderer: {
    root: ".",
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "command-note-html",
        transformIndexHtml(html, context) {
          const document = html
            .replace("<!-- figma:lang -->", "ko")
            .replace("<!-- figma:title -->", "커맨드 노트")
          if (context.server) return document
          return document.replace(
            "<head>",
            `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'">`,
          )
        },
      },
    ],
    define: { "import.meta.env.VITE_DESKTOP": JSON.stringify("true") },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    build: { rollupOptions: { input: path.resolve("index.html") } },
  },
})
