import sharedConfig from "@lucid-softworks/vitest-config";
import { mergeConfig, type ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = mergeConfig(sharedConfig, {
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
    },
    environment: "jsdom",
  },
});

export default config;
