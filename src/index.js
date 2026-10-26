/**
 * @jamesjiang8280/dsh-client-custom-skin — host half.
 *
 * The custom-skin feature is entirely browser-side: the user's background
 * image and appearance preferences live in localStorage, matching the same
 * visual-preference boundary the other third-party skins use (the Host
 * settings wire only exposes an allowlisted set of namespaces). This half is
 * a deliberate no-op so the package still loads as a normal cordis bundle;
 * the browser half is declared through package.json's `dsh.client` block.
 */
export const PACKAGE_ID = "dsh-client-custom-skin";
export const SETTINGS_NAMESPACE = "custom-skin";

export const inject = [];

export function apply(ctx) {
  // Intentionally empty: nothing to do on the Host side.
  void ctx;
}
