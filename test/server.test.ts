// @vitest-environment node

import { expect, it } from "vitest";

import { useVirtualizer } from "../src/index.js";

it("can load in a server runtime", () => {
  expect(typeof window).toBe("undefined");
  expect(useVirtualizer).toBeTypeOf("function");
});
