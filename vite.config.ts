import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        compatibility: "toy_model.html",
      },
    },
  },
});
