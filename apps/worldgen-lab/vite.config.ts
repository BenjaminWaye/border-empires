import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env": JSON.stringify({})
  },
  worker: {
    format: "es"
  }
});
