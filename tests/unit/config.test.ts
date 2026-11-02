import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  LANGUAGES,
  REQUIRED_KEYS,
  VIEW_KINDS,
  loadConfig,
  panelContainerId,
  pickLanguage,
} from "../../src/config";
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
    ["views", [{}], /missing required key "views\[0\]\.id"/],
    [
      "views",
      [{ id: "a.b", title: { en: "A", fr: "A" } }],
      /missing required key "views\[0\]\.kind"/,
    ],
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

// The panel views (V-2): typed `{ id, title: { en, fr }, kind }`. Each refusal names the view and the defect.
describe("loadConfig() views", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    id: "acme.tasks",
    title: { en: "Tasks", fr: "Tâches" },
    kind: "tasks",
    ...over,
  });
  const withViews = (views: unknown[]) => load({ ...readConfigJson(), views });

  it("the committed configuration ships one view per kind the panel supports", () => {
    expect(loadConfig(CONFIG_PATH).views.map((v) => v.kind)).toEqual([...VIEW_KINDS]);
  });

  it.each([...VIEW_KINDS])("accepts kind %s", (kind) => {
    expect(withViews([view({ kind })]).views[0].kind).toBe(kind);
  });

  it("refuses an unknown kind, naming it and the supported kinds", () => {
    expect(() => withViews([view({ kind: "calendar" })])).toThrow(
      /"views\[0\]\.kind" "calendar" is not a supported view kind \(tasks, messages, memory\)/
    );
  });

  // The language domain is the loader's own LANGUAGES: every member gets its own refusal.
  it.each([...LANGUAGES])("refuses a title missing language %s, naming it", (lang) => {
    const title: Record<string, string> = { en: "Tasks", fr: "Tâches" };
    delete title[lang];
    expect(() => withViews([view({ title })])).toThrow(
      `missing required key "views[0].title.${lang}"`
    );
  });

  it.each([
    [
      "an empty title",
      view({ title: { en: "", fr: "Tâches" } }),
      /"views\[0\]\.title\.en" must be a non-empty string/,
    ],
    ["a title that is a string", view({ title: "Tasks" }), /"views\[0\]\.title" must be an object/],
    [
      "an unknown title language",
      view({ title: { en: "T", fr: "T", de: "T" } }),
      /unknown key "views\[0\]\.title\.de"/,
    ],
    ["an unknown view key", view({ when: "x" }), /unknown key "views\[0\]\.when"/],
  ])("refuses %s", (_form, v, message) => {
    expect(() => withViews([v])).toThrow(message);
  });

  it("refuses two views with the same id, naming it", () => {
    expect(() => withViews([view(), view({ kind: "memory" })])).toThrow(
      /"views\[1\]\.id" "acme\.tasks" is already used by views\[0\]/
    );
  });

  it("an empty view list is valid (no panel)", () => {
    expect(withViews([]).views).toEqual([]);
  });
});

describe("panelContainerId() and pickLanguage()", () => {
  it("derives an activity-bar container id from the provider id (letters, digits, '-', '_')", () => {
    const c = loadConfig(CONFIG_PATH);
    expect(panelContainerId(c)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(panelContainerId({ ...c, id: "acme.crm" })).toBe("acme-crm-panel");
  });

  it.each([
    ["fr", "fr"],
    ["fr-ca", "fr"],
    ["en", "en"],
    ["en-gb", "en"],
    ["de", "en"],
  ])("display language %s -> %s", (input, out) => {
    expect(pickLanguage(input)).toBe(out);
  });
});

// V-6: the extension's description is bilingual in the config, like every user-facing string. One refusal per member
// of the loader's own LANGUAGES, plus the shapes the same check refuses.
describe("description (V-6)", () => {
  it.each([...LANGUAGES])("refuses a description missing language %s, naming it", (lang) => {
    const description: Record<string, string> = { en: "An extension.", fr: "Une extension." };
    delete description[lang];
    expect(() => load({ ...readConfigJson(), description })).toThrow(
      `missing required key "description.${lang}"`
    );
  });
  it.each([
    ["a plain string", "An extension.", /"description" must be an object/],
    [
      "an empty language",
      { en: "", fr: "Une extension." },
      /"description\.en" must be a non-empty string/,
    ],
    ["an unknown language", { en: "A", fr: "B", de: "C" }, /unknown key "description\.de"/],
  ])("refuses %s", (_l, description, message) => {
    expect(() => load({ ...readConfigJson(), description })).toThrow(message);
  });
});
