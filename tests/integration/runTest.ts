import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

// Launches a real VS Code with this extension under development and runs suite/index.ts inside
// its extension host. The VS Code version is the lowest one package.json's engines.vscode accepts,
// so the test proves the engine floor, not only the latest release. Needs a display: on Linux CI,
// `xvfb-run -a npm run test:integration`. Without one, VSCODE_TEST_HEADLESS=1 runs Electron's
// headless Ozone platform instead (no X server needed).
async function main(): Promise<void> {
  // compiled to out-test/tests/integration/runTest.js
  const extensionDevelopmentPath = resolve(__dirname, "..", "..", "..");
  const pkg = JSON.parse(readFileSync(resolve(extensionDevelopmentPath, "package.json"), "utf8"));
  const floor = String(pkg.engines.vscode).replace(/^\^/, "");
  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? floor,
    extensionDevelopmentPath,
    extensionTestsPath: resolve(__dirname, "suite", "index"),
    launchArgs: [
      "--disable-extensions",
      "--disable-workspace-trust",
      ...(process.env.VSCODE_TEST_HEADLESS === "1"
        ? ["--ozone-platform=headless", "--disable-gpu", "--no-sandbox"]
        : []),
    ],
  });
}

main().catch((err) => {
  console.error("integration test failed:", err);
  process.exit(1);
});
