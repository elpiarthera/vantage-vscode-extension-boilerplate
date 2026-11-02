import { resolve } from "node:path";
import Mocha from "mocha";

// Entry point the extension host calls (extensionTestsPath).
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 60_000 });
  mocha.addFile(resolve(__dirname, "extension.test.js"));
  return new Promise((ok, ko) => {
    mocha.run((failures) =>
      failures > 0 ? ko(new Error(`${failures} integration test(s) failed`)) : ok()
    );
  });
}
