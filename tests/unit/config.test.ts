import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, REQUIRED_KEYS, loadConfig } from "../../src/config";
import { CONFIG_PATH, readConfigJson, tempExtensionRoot } from "./helpers";

// V-2: the server is configuration. The loader refuses an incomplete or malformed file,
// naming the key, so a fork cannot ship a half-configured server.
const load = (config: Record<string, unknown>) =>
  loadConfig(join(tempExtensionRoot(config), "extension.config.json"));

describe("loadConfig()", () => {
  it("loads the committed extension.config.json", () => {
    const c = loadConfig(CONFIG_PATH);
    const raw = readConfigJson();
    expect(c.id).toBe(raw.id);
    expect(c.url).toBe(raw.url);
    expect(c.label).toBe(raw.label);
  });

  // The required-key domain is the loader's own REQUIRED_KEYS: every member gets its own refusal.
  it.each([...REQUIRED_KEYS])("refuses a file missing %s, naming it", (key) => {
    const raw = readConfigJson();
    delete raw[key];
    expect(() => load(raw)).toThrow(ConfigError);
    expect(() => load(raw)).toThrow(`missing required key "${key}"`);
  });

  it("refuses distribution without targets, naming distribution.targets", () => {
    expect(() => load({ ...readConfigJson(), distribution: {} })).toThrow(
      'missing required key "distribution.targets"'
    );
  });

  it("refuses an unknown key, naming it", () => {
    expect(() => load({ ...readConfigJson(), token: "x" })).toThrow('unknown key "token"');
  });

  it.each([
    ["id", 42, /"id" must be/],
    ["id", "has space", /"id" must be/],
    ["label", "", /"label" must be/],
    ["publisher", "Vantage OS", /"publisher" must be/],
    ["url", "not a url", /"url" must be/],
    ["url", "http://mcp.example.com/mcp", /"url" must be/],
    ["url", "https://user:pw@mcp.example.com/mcp", /"url" must not carry credentials/],
    ["icon", "media/missing.png", /"icon" .* does not exist/],
    ["views", {}, /"views" must be an array/],
    ["views", [{}], /"views\[0\]\.id" must be/],
  ])("refuses %s = %j", (key, value, message) => {
    expect(() => load({ ...readConfigJson(), [key]: value })).toThrow(message);
  });

  it("refuses targets that do not include vscode", () => {
    expect(() => load({ ...readConfigJson(), distribution: { targets: ["cursor"] } })).toThrow(
      /"distribution\.targets" must include "vscode"/
    );
  });

  it("accepts plain http only on a loopback host (local development)", () => {
    const c = load({ ...readConfigJson(), url: "http://127.0.0.1:3000/mcp" });
    expect(c.url).toBe("http://127.0.0.1:3000/mcp");
  });

  it("refuses a file that is not JSON, naming the file", () => {
    expect(() => loadConfig(join(__dirname, "nope.json"))).toThrow(/nope\.json/);
  });
});
