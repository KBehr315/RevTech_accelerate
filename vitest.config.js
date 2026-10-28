// Tests for db/ and worker/ (the web app has its own setup under web/).
// Each suite starts its own Postgres (PGlite) and applies every migration,
// which takes several seconds when the suites run side by side, so the
// setup and test time limits are well above Vitest's defaults.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
