// Maps the editor's theme kind onto the mosaic token theme. VS Code sets `data-vscode-theme-kind`
// on <body> (vscode-light, vscode-dark, vscode-high-contrast, vscode-high-contrast-light) and
// updates it when the user switches theme; mosaic tokens read `data-theme` on the root element.
// The page is complete without this script: it only refines the tokens the panel does not map
// onto editor variables. It reads no locale, stores nothing and contacts nothing.
(() => {
  const root = document.documentElement;
  const body = document.body;
  const apply = () => {
    const kind = body.getAttribute("data-vscode-theme-kind") || "";
    const dark = kind === "vscode-dark" || kind === "vscode-high-contrast";
    root.setAttribute("data-theme", dark ? "dark" : "light");
  };
  apply();
  new MutationObserver(apply).observe(body, {
    attributes: true,
    attributeFilter: ["data-vscode-theme-kind"],
  });
})();
