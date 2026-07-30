import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";

const config: UserConfig = defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: "dist",
  },
  plugins: [react()],
});

export default config;
