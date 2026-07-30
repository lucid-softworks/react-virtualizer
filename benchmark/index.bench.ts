import { benchmarkPublicApi } from "@lucid-softworks/vitest-config/benchmark";

import * as publicApi from "../src/index.js";

benchmarkPublicApi("@lucid-softworks/react-virtualizer", publicApi);
