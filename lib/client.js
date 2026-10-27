// @jamesjiang8280/dsh-client-custom-skin — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules at /plugins/@jamesjiang8280/dsh-client-custom-skin/client.js
// and executed through the vendored cordis Loader's lazy-CJS module table
// (window.__ModuleLoader__.load). The factory body is plain CJS with
// require() resolved against the shell's module table.
//
// What this plugin does:
//   - Lets the user pick a custom background image for the DSH Web UI.
//   - Exposes contrast / brightness / blur controls for the image itself, plus
//     a readability veil ("wash") and surface-opacity control so the UI stays
//     beautiful, operable and readable on any image.
//   - Persists everything in localStorage (visual preference, same boundary as
//     other third-party skins: the Host settings wire is allowlist-only).

window.__ModuleLoader__.load({
	id: "@jamesjiang8280/dsh-client-custom-skin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var jsx = require("react/jsx-runtime").jsx;

		var PACKAGE_ID = "@jamesjiang8280/dsh-client-custom-skin";
		/** Locale namespace owning this plugin's settings-row copy. */
		var NS = "custom-skin";

		//#region storage keys & defaults
		var KEY = {
			enabled: "dsh-custom-skin:enabled",
			image: "dsh-custom-skin:image",
			kind: "dsh-custom-skin:image-kind",
			contrast: "dsh-custom-skin:contrast",
			brightness: "dsh-custom-skin:brightness",
			blur: "dsh-custom-skin:blur",
			wash: "dsh-custom-skin:wash",
			surface: "dsh-custom-skin:surface",
			sidebar: "dsh-custom-skin:sidebar",
			autoTheme: "dsh-custom-skin:auto-theme",
			sidebarColor: "dsh-custom-skin:sidebar-color",
			sidebarColorAlpha: "dsh-custom-skin:sidebar-color-alpha",
		};

		var DEFAULTS = {
			enabled: true,
			image: null,
			kind: "url",
			/** Percent: 50..200 -> CSS contrast(var/100). */
			contrast: 100,
			/** Percent: 50..150 -> CSS brightness(var/100). */
			brightness: 100,
			/** Pixels: 0..30. */
			blur: 0,
			/** Percent: 0..100 readability veil opacity. */
			wash: 45,
			/** Percent: 30..100 surface fill opacity (panels/cards/menus). */
			surface: 88,
			/**
			 * Percent: 0..100 sidebar TRANSPARENCY (user-facing meaning).
			 * 0 = the sidebar is fully opaque, the background image is hidden
			 * behind it; 100 = fully transparent, the image shows through.
			 * Mapped to fill alpha as 1 - value/100.
			 */
			sidebar: 15,
			/**
			 * When on, the readability scheme follows the background image: a
			 * light-toned image drives the host Appearance preference to `light`,
			 * a dark-toned one drives it to `dark`.
			 */
			autoTheme: true,
			sidebarColor: null,
			sidebarColorAlpha: 80,
		};

		/** Per-scheme opaque source colors used to derive translucent surfaces. */
		var SURFACES = {
			light: {
				layer1: [255, 255, 255],
				layer2: [252, 253, 255],
				layer3: [247, 249, 252],
				sidebar: [249, 250, 251],
				page: "rgb(250 250 251)",
				wash: [255, 255, 255]
			},
			dark: {
				layer1: [35, 35, 36],
				layer2: [44, 44, 46],
				layer3: [53, 54, 56],
				sidebar: [27, 27, 28],
				page: "rgb(21 21 23)",
				wash: [8, 9, 12]
			}
		};
		//#endregion

		function clamp(value, min, max) {
			if (!Number.isFinite(value)) return min;
			return Math.min(max, Math.max(min, value));
		}

		function rgba(rgb, alpha) {
			return "rgb(" + rgb[0] + " " + rgb[1] + " " + rgb[2] + " / " + clamp(alpha, 0, 1) + ")";
		}

		/**
		 * Publish one independent surface fill, or clear it so the surface inherits
		 * the scheme palette. Writing `null` back through setProperty would rely on
		 * CSSOM's remove-on-null behavior, so the property is removed explicitly.
		 */
		function publishFill(body, name, color, alphaPercent) {
			var value = color ? hexToRgba(color, alphaPercent / 100) : null;
			if (value === null) body.style.removeProperty(name);
			else body.style.setProperty(name, value);
		}

		/**
		 * Convert a #rrggbb (or #rgb) hex color to an `rgb(r g b / a)` string so
		 * it can be injected into the same token slots as the built-in palette.
		 */
		function hexToRgba(hex, alpha) {
			var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
			if (!m) return null;
			var h = m[1];
			if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
			var r = parseInt(h.slice(0, 2), 16);
			var g = parseInt(h.slice(2, 4), 16);
			var b = parseInt(h.slice(4, 6), 16);
			return "rgb(" + r + " " + g + " " + b + " / " + clamp(alpha, 0, 1) + ")";
		}

		/** RGB triplet (0..255 each) to a #rrggbb string for a color input. */
		function rgbToHex(rgb) {
			return "#" + rgb.map(function (channel) {
				return clamp(channel, 0, 255).toString(16).padStart(2, "0");
			}).join("");
		}

		/**
		 * The fill a color row inherits while the user has not picked a custom
		 * color: the active scheme's sidebar surface. Used only to seed the
		 * picker's initial value, so it reads the scheme from the body attribute
		 * the presenter keeps in sync.
		 */
		function schemeHex(_snapshot, kind) {
			var dark = false;
			try { dark = document.body.hasAttribute("data-ds-dark-theme"); } catch { /* assume light */ }
			var scheme = dark ? SURFACES.dark : SURFACES.light;
			return rgbToHex(kind === "sidebar" ? scheme.sidebar : scheme.layer2);
		}

		function readNumber(key, fallback) {
			try {
				var raw = localStorage.getItem(key);
				if (raw === null || raw === "") return fallback;
				var n = Number(raw);
				return Number.isFinite(n) ? n : fallback;
			} catch {
				return fallback;
			}
		}

		function readString(key, fallback) {
			try {
				var raw = localStorage.getItem(key);
				return raw === null || raw === "" ? fallback : raw;
			} catch {
				return fallback;
			}
		}

		function writeString(key, value) {
			try {
				if (value === null || value === undefined) localStorage.removeItem(key);
				else localStorage.setItem(key, String(value));
				return true;
			} catch {
				return false;
			}
		}

		//#region preference store
		/**
		 * Build the immutable preference snapshot and its write surface.
		 * The snapshot object identity only changes on a real write, which is
		 * what useSyncExternalStore requires.
		 */
		function createPreferenceStore() {
			var listeners = new Set();

			function readSnapshot() {
				var image = readString(KEY.image, null);
				return {
					enabled: readString(KEY.enabled, "1") !== "0",
					image: image,
					kind: readString(KEY.kind, "url"),
					contrast: clamp(readNumber(KEY.contrast, DEFAULTS.contrast), 50, 200),
					brightness: clamp(readNumber(KEY.brightness, DEFAULTS.brightness), 50, 150),
					blur: clamp(readNumber(KEY.blur, DEFAULTS.blur), 0, 30),
					wash: clamp(readNumber(KEY.wash, DEFAULTS.wash), 0, 100),
					surface: clamp(readNumber(KEY.surface, DEFAULTS.surface), 30, 100),
					sidebar: clamp(readNumber(KEY.sidebar, DEFAULTS.sidebar), 0, 100),
					autoTheme: readString(KEY.autoTheme, "1") !== "0",
					sidebarColor: readString(KEY.sidebarColor, ""),
					sidebarColorAlpha: clamp(readNumber(KEY.sidebarColorAlpha, 80), 0, 100),
					
					/** Last image-tone analysis: "light" | "dark" | null (never persisted). */
					detectedTone: null
				};
			}

			var snapshot = readSnapshot();

			function emit() {
				for (var listener of listeners) {
					try { listener(); } catch { /* a bad row must not break the others */ }
				}
			}

			function commit(next) {
				if (next === snapshot) return;
				snapshot = next;
				emit();
			}

			function patch(partial, storage) {
				for (var key in partial) {
					if (snapshot[key] !== partial[key]) {
						commit(Object.assign({}, snapshot, partial));
						if (storage !== false) persist(partial);
						return;
					}
				}
			}

			function persist(partial) {
				if ("enabled" in partial) writeString(KEY.enabled, partial.enabled ? "1" : "0");
				if ("image" in partial) writeString(KEY.image, partial.image);
				if ("kind" in partial) writeString(KEY.kind, partial.kind);
				if ("contrast" in partial) writeString(KEY.contrast, String(partial.contrast));
				if ("brightness" in partial) writeString(KEY.brightness, String(partial.brightness));
				if ("blur" in partial) writeString(KEY.blur, String(partial.blur));
				if ("wash" in partial) writeString(KEY.wash, String(partial.wash));
				if ("surface" in partial) writeString(KEY.surface, String(partial.surface));
				if ("sidebar" in partial) writeString(KEY.sidebar, String(partial.sidebar));
				if ("autoTheme" in partial) writeString(KEY.autoTheme, partial.autoTheme ? "1" : "0");
				if ("sidebarColor" in partial) writeString(KEY.sidebarColor, partial.sidebarColor || "");
				if ("sidebarColorAlpha" in partial) writeString(KEY.sidebarColorAlpha, String(partial.sidebarColorAlpha));
			}

			// Cross-tab sync: another DSH tab writing our keys updates this one.
			var onStorage = (event) => {
				if (!event.key || event.key.indexOf("dsh-custom-skin:") !== 0) return;
				commit(readSnapshot());
			};
			try { window.addEventListener("storage", onStorage); } catch { /* storage events unavailable */ }

			return {
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				setEnabled(enabled) {
					var next = snapshot.enabled === enabled ? snapshot : Object.assign({}, snapshot, { enabled: enabled });
					commit(next);
					persist({ enabled: enabled });
				},
				setImage(image, kind) {
					var next = Object.assign({}, snapshot, { image: image, kind: kind });
					commit(next);
					persist({ image: image, kind: kind });
				},
				clearImage() {
					var next = Object.assign({}, snapshot, { image: null, kind: "url" });
					commit(next);
					persist({ image: null, kind: "url" });
				},
				setContrast(percent) { patch({ contrast: clamp(percent, 50, 200) }); },
				setBrightness(percent) { patch({ brightness: clamp(percent, 50, 150) }); },
				setBlur(px) { patch({ blur: clamp(px, 0, 30) }); },
				setWash(percent) { patch({ wash: clamp(percent, 0, 100) }); },
				setSurface(percent) { patch({ surface: clamp(percent, 30, 100) }); },
				setSidebar(percent) { patch({ sidebar: clamp(percent, 0, 100) }); },
				setAutoTheme(on) { patch({ autoTheme: !!on }); },
				setSidebarColor(color) { patch({ sidebarColor: color || null }); },
				setSidebarColorAlpha(percent) { patch({ sidebarColorAlpha: clamp(percent, 0, 100) }); },
				
				setDetectedTone(tone) { patch({ detectedTone: tone === "light" || tone === "dark" ? tone : null }, false); },
				reset() {
					var next = {
						enabled: DEFAULTS.enabled,
						image: snapshot.image,
						kind: snapshot.kind,
						contrast: DEFAULTS.contrast,
						brightness: DEFAULTS.brightness,
						blur: DEFAULTS.blur,
						wash: DEFAULTS.wash,
						surface: DEFAULTS.surface,
						sidebar: DEFAULTS.sidebar,
						autoTheme: DEFAULTS.autoTheme,
						sidebarColor: DEFAULTS.sidebarColor,
						sidebarColorAlpha: DEFAULTS.sidebarColorAlpha,
						
						detectedTone: snapshot.detectedTone
					};
					commit(next);
					writeString(KEY.enabled, "1");
					writeString(KEY.contrast, String(DEFAULTS.contrast));
					writeString(KEY.brightness, String(DEFAULTS.brightness));
					writeString(KEY.blur, String(DEFAULTS.blur));
					writeString(KEY.wash, String(DEFAULTS.wash));
					writeString(KEY.surface, String(DEFAULTS.surface));
					writeString(KEY.sidebar, String(DEFAULTS.sidebar));
					writeString(KEY.autoTheme, DEFAULTS.autoTheme ? "1" : "0");
					// The color fields must be persisted too, or a reload would
					// resurrect the values "reset to defaults" just cleared.
					writeString(KEY.sidebarColor, "");
					writeString(KEY.sidebarColorAlpha, String(DEFAULTS.sidebarColorAlpha));
				},
				dispose() {
					try { window.removeEventListener("storage", onStorage); } catch { /* ignore */ }
					listeners.clear();
				}
			};
		}
		//#endregion

		//#region styles
		var CSS = [
			// Backdrop container sits on the page's own stacking layer, above the
			// body fill but below every piece of UI content.
			".cs-root{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:var(--cs-page,#fafafa);opacity:0;transition:opacity 220ms ease}",
			"body[data-cs-skin=\"on\"] .cs-root{opacity:1}",
			".cs-image{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat;transform:scale(1.03);filter:contrast(var(--cs-contrast,1)) brightness(var(--cs-brightness,1)) blur(var(--cs-blur,0px))}",
			// Readability veil: sits between the image and every surface.
			".cs-wash{position:absolute;inset:0;background:var(--cs-wash,transparent);transition:background-color 180ms linear}",
			".cs-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;background:#000}",

			// While the skin is on, the shell background and content surface tokens
			// become translucent; text/label tokens stay native so contrast rules
			// are untouched.
			"html body[data-cs-skin=\"on\"]{isolation:isolate;--dsw-alias-bg-base:transparent!important;--dsw-alias-bg-layer-1:var(--cs-layer-1)!important;--dsw-specific-sidebar-fill:var(--cs-sidebar-fill,var(--cs-sidebar))!important;--dsw-alias-bg-layer-2:var(--cs-layer-2)!important;--dsw-alias-bg-layer-3:var(--cs-layer-3)!important;--dsw-specific-menu:var(--cs-layer-3)!important;--dsw-specific-input-major:var(--cs-sidebar-fill,var(--cs-sidebar))!important;--dsw-specific-selector:var(--cs-layer-2)!important;--dsw-alias-button-elevated-fill:var(--cs-layer-1)!important;--dsw-alias-button-floating-fill:var(--cs-layer-2)!important;--dsw-alias-button-floating-hover:var(--cs-layer-3)!important;--dsw-alias-interactive-bg-hover-solid:var(--cs-layer-2)!important;--dsw-alias-markdown-citation:var(--cs-layer-2)!important;--dsw-alias-markdown-code-block:var(--cs-layer-1)!important;--dsw-alias-markdown-code-block-banner:var(--cs-layer-2)!important;--dsw-alias-markdown-inline-code:var(--cs-layer-2)!important;--dsw-alias-markdown-code-segment-selected:var(--cs-layer-2)!important;--dsw-alias-markdown-code-segment-unselected:var(--cs-layer-1)!important;--dsw-alias-markdown-tag:var(--cs-layer-2)!important;--dsw-alias-markdown-placeholder:var(--cs-layer-1)!important;--dsw-alias-bg-module-platform:var(--cs-layer-2)!important;background:var(--cs-page,#fafafa)!important}",
			// The Settings modal is exempt from the skin: it must stay the plain
			// theme surface (solid light / solid dark) for readability, so every
			// token the skin overrides is restored to its theme value inside the
			// settings panel subtree. The hook is the semantic data attribute the
			// shell puts on the panel — stable across hashed class name changes.
			// Proximity (the panel element) beats the body-level overrides without
			// needing !important here.
			"html body[data-cs-skin='on'] [data-shortcut-modal='settings']{--dsw-alias-bg-base:var(--dsw-static-neutral-bluish-00);--dsw-alias-bg-layer-1:var(--dsw-static-neutral-bluish-00);--dsw-alias-bg-layer-2:var(--dsw-static-neutral-bluish-00);--dsw-alias-bg-layer-3:var(--dsw-static-neutral-bluish-00);--dsw-specific-sidebar-fill:var(--dsw-static-neutral-bluish-50);--dsw-specific-menu:var(--dsw-menu-surface-fill);--dsw-specific-input-major:var(--dsw-static-neutral-bluish-00);--dsw-specific-selector:var(--dsw-static-neutral-bluish-60);--dsw-alias-button-elevated-fill:var(--dsw-static-neutral-bluish-00);--dsw-alias-button-floating-fill:var(--dsw-static-neutral-bluish-00);--dsw-alias-button-floating-hover:var(--dsw-static-neutral-bluish-75);--dsw-alias-interactive-bg-hover-solid:var(--dsw-static-neutral-bluish-75);--dsw-alias-markdown-citation:var(--dsw-static-neutral-bluish-100);--dsw-alias-markdown-code-block:var(--dsw-static-neutral-bluish-50);--dsw-alias-markdown-code-block-banner:var(--dsw-static-neutral-bluish-50);--dsw-alias-markdown-inline-code:var(--dsw-static-neutral-50);--dsw-alias-markdown-code-segment-selected:var(--dsw-static-neutral-bluish-00);--dsw-alias-markdown-code-segment-unselected:var(--dsw-static-neutral-bluish-75);--dsw-alias-markdown-tag:var(--dsw-static-neutral-bluish-75);--dsw-alias-markdown-placeholder:var(--dsw-static-neutral-bluish-60);--dsw-alias-bg-module-platform:var(--dsw-static-neutral-bluish-60)}",
			"html body[data-cs-skin='on'][data-ds-dark-theme] [data-shortcut-modal='settings']{--dsw-alias-bg-base:var(--dsw-static-neutral-bluish-950);--dsw-alias-bg-layer-1:var(--dsw-static-neutral-bluish-875);--dsw-alias-bg-layer-2:var(--dsw-static-neutral-bluish-850);--dsw-alias-bg-layer-3:var(--dsw-static-neutral-bluish-800);--dsw-specific-sidebar-fill:var(--dsw-static-neutral-bluish-900);--dsw-specific-menu:var(--dsw-menu-surface-fill);--dsw-specific-input-major:var(--dsw-static-neutral-bluish-850);--dsw-specific-selector:var(--dsw-static-neutral-bluish-800);--dsw-alias-button-elevated-fill:var(--dsw-static-neutral-bluish-750);--dsw-alias-button-floating-fill:var(--dsw-static-neutral-bluish-850);--dsw-alias-button-floating-hover:var(--dsw-static-neutral-bluish-800);--dsw-alias-interactive-bg-hover-solid:var(--dsw-static-neutral-bluish-800);--dsw-alias-markdown-citation:var(--dsw-static-neutral-bluish-800);--dsw-alias-markdown-code-block:var(--dsw-static-neutral-bluish-900);--dsw-alias-markdown-code-block-banner:var(--dsw-static-neutral-bluish-850);--dsw-alias-markdown-inline-code:var(--dsw-static-neutral-800);--dsw-alias-markdown-code-segment-selected:var(--dsw-static-neutral-bluish-800);--dsw-alias-markdown-code-segment-unselected:var(--dsw-static-neutral-bluish-900);--dsw-alias-markdown-tag:var(--dsw-static-neutral-bluish-850);--dsw-alias-markdown-placeholder:var(--dsw-static-neutral-bluish-850);--dsw-alias-bg-module-platform:var(--dsw-static-neutral-bluish-800)}",
			"body[data-cs-skin=\"on\"]>#root{background:transparent!important}",
			"body[data-cs-skin=\"on\"] button,body[data-cs-skin=\"on\"] input,body[data-cs-skin=\"on\"] textarea{transition:color 160ms linear,background-color 160ms linear,border-color 160ms linear}",

			// Settings section column (hosts the row list, like the General section).
			".cs-section{display:flex;flex-direction:column;width:100%}",

			// Settings row (mirrors the native general-section rhythm).
			".cs-group{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}",
			".cs-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}",
			".cs-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".cs-subtitle{color:var(--dsw-alias-label-primary);padding-top:6px;font-size:13px;font-weight:500;line-height:20px}",
			".cs-color{display:flex;flex-direction:column;gap:8px}",
			".cs-color__picker{box-sizing:border-box;flex:0 0 auto;width:36px;height:26px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer}",
			".cs-color__picker::-webkit-color-swatch-wrapper{padding:0}",
			".cs-color__picker::-webkit-color-swatch{border:0;border-radius:5px}",
			".cs-color__picker::-moz-color-swatch{border:0;border-radius:5px}",
			".cs-color__hex{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".cs-color__reset{height:26px;padding:0 10px;font-size:12px}",
			".cs-color__reset:disabled{opacity:.45;cursor:default}",
			".cs-color--disabled{opacity:.5}",
			".cs-color--disabled .cs-color__picker,.cs-color--disabled .cs-slider{cursor:not-allowed}",
			".cs-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:32px}",
			".cs-row-label{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}",
			".cs-value{color:var(--dsw-alias-label-tertiary);font-size:12px;font-variant-numeric:tabular-nums;min-width:42px;text-align:right}",
			".cs-slider{flex:1;min-width:0;height:28px;cursor:ew-resize;appearance:none;background:transparent}",
			".cs-slider::-webkit-slider-runnable-track{height:2px;border-radius:1px;background:var(--dsw-alias-border-l3)}",
			".cs-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:13px;height:13px;margin-top:-5.5px;border:1.5px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-state-business-primary));border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 4px rgb(0 0 0 / 18%)}",
			".cs-slider::-moz-range-track{height:2px;border-radius:1px;background:var(--dsw-alias-border-l3)}",
			".cs-slider::-moz-range-thumb{width:11px;height:11px;border:1.5px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,var(--dsw-alias-state-business-primary));border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff)}",
			".cs-slider:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",

			".cs-switch{box-sizing:border-box;position:relative;display:inline-flex;flex:0 0 auto;align-items:center;width:36px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);cursor:pointer;transition:background-color 160ms linear,border-color 160ms linear}",
			".cs-switch[aria-pressed=\"true\"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary)}",
			".cs-switch__knob{width:14px;height:14px;margin:0 2px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgb(0 0 0 / 24%);transition:transform 160ms ease}",
			".cs-switch[aria-pressed=\"true\"] .cs-switch__knob{transform:translateX(16px)}",
			".cs-switch:disabled{opacity:0.6;cursor:progress}",

			".cs-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:13px;line-height:20px;cursor:pointer}",
			".cs-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".cs-button:disabled{opacity:0.55;cursor:progress}",
			".cs-button--primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff);background:var(--dsw-alias-state-business-primary)}",
			".cs-button--primary:hover:not(:disabled){background:var(--dsw-alias-state-business-primary);filter:brightness(1.06)}",
			".cs-button--danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:transparent}",
			".cs-button--danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}",
			".cs-button--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}",

			".cs-url{box-sizing:border-box;flex:1;min-width:0;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:13px;line-height:20px}",
			".cs-url::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".cs-url:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}",

			".cs-preview{position:relative;aspect-ratio:16/9;max-height:160px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform)}",
			".cs-preview img{display:block;width:100%;height:100%;object-fit:cover}",
			".cs-preview--empty{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}",
			".cs-actions{display:flex;flex-wrap:wrap;gap:8px}",
			".cs-url-row{display:flex;gap:8px;width:100%}",

			"@media (prefers-reduced-motion:reduce){.cs-root,.cs-wash,body[data-cs-skin=\"on\"] button,body[data-cs-skin=\"on\"] input,body[data-cs-skin=\"on\"] textarea,.cs-switch,.cs-switch__knob{transition:none}}"
		].join("");

		var styleTag = null;
		function installStyles() {
			styleTag = document.createElement("style");
			styleTag.dataset.plugin = PACKAGE_ID;
			styleTag.textContent = CSS;
			document.head.appendChild(styleTag);
			return () => {
				if (styleTag !== null) {
					styleTag.remove();
					styleTag = null;
				}
			};
		}
		//#endregion

		//#region media helpers
		/**
		 * Read an image file into a bounded JPEG data URL. The source is resized
		 * to at most 1920px on its longer edge and re-encoded, so a normal photo
		 * stays comfortably inside the per-origin localStorage budget.
		 *
		 * GIF files are kept as-is (raw data URL) so their animation frames
		 * survive — re-encoding a GIF through a canvas would collapse it to a
		 * single static frame.
		 */
		function readImageFile(file) {
			return new Promise(function (resolve, reject) {
				if (!file || !/^image\//.test(file.type)) {
					reject(new Error("NOT_IMAGE"));
					return;
				}
				// GIF: preserve animation by storing the raw data URL untouched.
				if (/^image\/gif$/i.test(file.type)) {
					var reader = new FileReader();
					reader.onerror = function () { reject(reader.error || new Error("READ_FAILED")); };
					reader.onload = function () { resolve(String(reader.result)); };
					reader.readAsDataURL(file);
					return;
				}
				var reader = new FileReader();
				reader.onerror = function () { reject(reader.error || new Error("READ_FAILED")); };
				reader.onload = function () {
					var image = new Image();
					image.onerror = function () { reject(new Error("DECODE_FAILED")); };
					image.onload = function () {
						try {
							var width = image.naturalWidth || image.width;
							var height = image.naturalHeight || image.height;
							var scale = Math.min(1, 1920 / Math.max(width, height));
							var canvas = document.createElement("canvas");
							canvas.width = Math.max(1, Math.round(width * scale));
							canvas.height = Math.max(1, Math.round(height * scale));
							canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
							resolve(canvas.toDataURL("image/jpeg", 0.85));
						} catch (error) {
							reject(error);
						}
					};
					image.src = String(reader.result);
				};
				reader.readAsDataURL(file);
			});
		}

		/**
		 * Read a local video file (mp4) into a blob URL for playback.
		 * Note: blob URLs only survive the current session, so after a page
		 * refresh the user must re-select the file (or paste an https:// mp4 link).
		 */
		function readVideoFile(file) {
			return new Promise(function (resolve, reject) {
				if (!file || !/^video\/mp4$/i.test(file.type)) {
					reject(new Error("NOT_VIDEO"));
					return;
				}
				try {
					resolve(URL.createObjectURL(file));
				} catch (error) {
					reject(error);
				}
			});
		}

		/** Accept http(s), relative paths and data: URLs for images or mp4 video. */
		function isSafeMediaUrl(value) {
			if (typeof value !== "string") return false;
			var trimmed = value.trim();
			if (trimmed === "") return false;
			if (/^data:(image|video)\//i.test(trimmed)) return true;
			if (/^https?:\/\//i.test(trimmed)) return true;
			if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return true;
			return false;
		}
		/**
		 * sRGB channel (0..1) to linear light. Averaging the raw gamma-encoded
		 * values would over-weight bright pixels, so tone is measured in linear
		 * space instead — that is what makes "is this image light or dark?" match
		 * what the eye reads.
		 */
		function toLinear(channel) {
			return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
		}

		/**
		 * Classify a background image as a light- or dark-toned surface.
		 *
		 * The image is downsampled into a 32x32 canvas and reduced to its
		 * alpha-weighted mean linear luminance (Rec.709 weights). The cut sits at
		 * 0.20 — perceptual mid-grey (#808080) is ~0.216 linear — so an image has
		 * to be clearly dark before the dark scheme is chosen.
		 *
		 * Resolves `null` when the tone cannot be read: a cross-origin image whose
		 * server sends no CORS headers taints the canvas (SecurityError), and a
		 * broken link simply never loads. Callers must treat `null` as "keep the
		 * user's current appearance" rather than guessing.
		 */
		function detectImageTone(url) {
			return new Promise(function (resolve) {
				try {
					var probe = new Image();
					if (/^https?:/i.test(url)) probe.crossOrigin = "anonymous";
					probe.onload = function () {
						try {
							var size = 32;
							var canvas = document.createElement("canvas");
							canvas.width = size;
							canvas.height = size;
							var context = canvas.getContext("2d");
							context.drawImage(probe, 0, 0, size, size);
							var pixels = context.getImageData(0, 0, size, size).data;
							var weighted = 0;
							var weight = 0;
							for (var i = 0; i < pixels.length; i += 4) {
								var alpha = pixels[i + 3] / 255;
								if (alpha <= 0) continue;
								var luminance = 0.2126 * toLinear(pixels[i] / 255)
									+ 0.7152 * toLinear(pixels[i + 1] / 255)
									+ 0.0722 * toLinear(pixels[i + 2] / 255);
								weighted += luminance * alpha;
								weight += alpha;
							}
							if (weight === 0) { resolve(null); return; }
							resolve(weighted / weight >= 0.2 ? "light" : "dark");
						} catch {
							resolve(null);
						}
					};
					probe.onerror = function () { resolve(null); };
					probe.src = url;
				} catch {
					resolve(null);
				}
			});
		}
		//#endregion

		//#region presenter
		/**
		 * Owns the backdrop DOM and the body-level CSS variables. Every visual
		 * change flows through apply(), so the settings row and the cross-tab
		 * storage listener share one code path.
		 */
		function createPresenter(store, themeService) {
			var root = null;
			var imageEl = null;
			var videoEl = null;
			var washEl = null;
			var unsubscribe = store.subscribe(apply);
			var disposed = false;
			/** Image URL the tone analysis was last run against (null = none yet). */
			var analyzedImage = null;
			/** True while a tone analysis is in flight, so apply() stays re-entrant. */
			var analyzing = false;
			/** Blob URL created for a local video file, so it can be revoked on teardown. */
			var videoBlobUrl = null;

			function isDark() {
				try {
					if (themeService && typeof themeService.getTheme === "function") {
						var snapshot = themeService.getTheme();
						if (snapshot && snapshot.active && snapshot.active.colorScheme === "dark") return true;
						if (snapshot && snapshot.active && snapshot.active.colorScheme === "light") return false;
					}
				} catch { /* fall through to the DOM attribute */ }
				return document.body.hasAttribute("data-ds-dark-theme");
			}

			function ensureRoot() {
				if (root !== null && document.body.contains(root)) return;
				root = document.createElement("div");
				root.className = "cs-root";
				root.setAttribute("aria-hidden", "true");
				imageEl = document.createElement("div");
				imageEl.className = "cs-image";
				videoEl = document.createElement("video");
				videoEl.className = "cs-video";
				videoEl.setAttribute("playsinline", "");
				videoEl.setAttribute("muted", "");
				videoEl.setAttribute("autoplay", "");
				videoEl.setAttribute("loop", "");
				videoEl.style.display = "none";
				washEl = document.createElement("div");
				washEl.className = "cs-wash";
				root.append(imageEl, videoEl, washEl);
				document.body.prepend(root);
			}

			/** Every custom property the presenter publishes on <body>. */
			var BODY_VARS = ["--cs-page", "--cs-layer-1", "--cs-layer-2", "--cs-layer-3", "--cs-sidebar", "--cs-sidebar-fill", "--cs-wash", "--cs-contrast", "--cs-brightness", "--cs-blur"];

			/** Drop the backdrop and every published variable (skin off / no image). */
			function teardown() {
				if (root !== null) {
					if (videoBlobUrl !== null) {
						try { URL.revokeObjectURL(videoBlobUrl); } catch { /* ignore */ }
						videoBlobUrl = null;
					}
					root.remove();
					root = null;
					imageEl = null;
					videoEl = null;
					washEl = null;
				}
				document.body.removeAttribute("data-cs-skin");
				for (var name of BODY_VARS) document.body.style.removeProperty(name);
			}

			/**
			 * Read the current image's overall tone and, when auto-appearance is on,
			 * drive the Host Appearance preference to match it. Runs once per image:
			 * `analyzedImage` is claimed up front so the `theme/change` that our own
			 * setTheme() emits cannot start another analysis.
			 */
			function syncAutoTheme() {
				var snapshot = store.getSnapshot();
				var active = snapshot.enabled && snapshot.image !== null;
				if (!active || !snapshot.autoTheme) {
					analyzedImage = null;
					if (snapshot.detectedTone !== null) store.setDetectedTone(null);
					return;
				}
				var url = snapshot.image;
				if (url === analyzedImage || analyzing) return;
				analyzing = true;
				detectImageTone(url).then(function (tone) {
					analyzing = false;
					if (disposed) return;
					analyzedImage = url;
					store.setDetectedTone(tone);
					if (tone === null) return;
					// Re-read: the user may have cleared the image or switched the
					// toggle off while the canvas was decoding.
					var latest = store.getSnapshot();
					if (!latest.autoTheme || !latest.enabled || latest.image !== url) return;
					if (themeService === null || typeof themeService.setTheme !== "function") return;
					try {
						var current = themeService.getTheme();
						if (current && current.preference !== tone) themeService.setTheme(tone);
					} catch { /* Appearance is unavailable: keep the detected tone only */ }
				}, function () { analyzing = false; });
			}

			function apply() {
				if (disposed) return;
				var snapshot = store.getSnapshot();
				var active = snapshot.enabled && snapshot.image !== null;
				if (!active) {
					teardown();
					syncAutoTheme();
					return;
				}
				ensureRoot();
				var dark = isDark();
				var scheme = dark ? SURFACES.dark : SURFACES.light;
				var surfaceAlpha = clamp(snapshot.surface / 100, 0.3, 1);
				var washAlpha = clamp(snapshot.wash / 100, 0, 1);
				var body = document.body;
				body.setAttribute("data-cs-skin", "on");
				body.style.setProperty("--cs-page", scheme.page);
				body.style.setProperty("--cs-layer-1", rgba(scheme.layer1, surfaceAlpha));
				body.style.setProperty("--cs-layer-2", rgba(scheme.layer2, clamp(surfaceAlpha + 0.04, 0, 1)));
				body.style.setProperty("--cs-layer-3", rgba(scheme.layer3, clamp(surfaceAlpha + 0.08, 0, 1)));
				// Sidebar has its OWN control: the value is TRANSPARENCY, so the
				// fill alpha is its complement (100 -> 0 alpha -> image shows).
				var sidebarAlpha = clamp(1 - snapshot.sidebar / 100, 0, 1);
				body.style.setProperty("--cs-sidebar", rgba(scheme.sidebar, sidebarAlpha));
				// Independent sidebar base color (full hue picker + alpha).
				// An unset OR unparseable color both fall back to the scheme fill:
				// the token mapping reads `var(--cs-*-fill, var(--cs-*))`.
				// Sidebar fill: only publish when the user picked a custom color,
				// otherwise leave `--cs-sidebar` (the transparency slider) in charge.
				// This fill is ALSO what the chat typing area reads via
				// --dsw-specific-input-major, so sidebar and chat stay matched.
				publishFill(body, "--cs-sidebar-fill", snapshot.sidebarColor, snapshot.sidebarColorAlpha);
				body.style.setProperty("--cs-wash", rgba(scheme.wash, washAlpha));
				body.style.setProperty("--cs-contrast", String(snapshot.contrast / 100));
				body.style.setProperty("--cs-brightness", String(snapshot.brightness / 100));
				body.style.setProperty("--cs-blur", snapshot.blur + "px");
				// Render the backdrop as a still image or a looping video.
				var isVideo = snapshot.kind === "video";
				imageEl.style.display = isVideo ? "none" : "block";
				videoEl.style.display = isVideo ? "block" : "none";
				if (isVideo) {
					if (videoEl.src !== snapshot.image) {
						if (videoBlobUrl !== null) {
							try { URL.revokeObjectURL(videoBlobUrl); } catch { /* ignore */ }
							videoBlobUrl = null;
						}
						videoEl.src = snapshot.image;
						if (snapshot.image.indexOf("blob:") === 0) videoBlobUrl = snapshot.image;
					}
					try { videoEl.play(); } catch { /* autoplay may be blocked until user gesture */ }
				} else {
					imageEl.style.backgroundImage = "url(" + JSON.stringify(snapshot.image) + ")";
				}
				syncAutoTheme();
			}

			apply();

			return {
				apply: apply,
				dispose() {
					disposed = true;
					unsubscribe();
					teardown();
				}
			};
		}
		//#endregion

		//#region settings row
		/**
		 * One slider row: label + range input + live value readout.
		 */
		function SliderRow(props) {
			return jsx("div", {
				className: "cs-row",
				children: [
					jsx("span", { className: "cs-row-label", children: props.label }),
					jsx("input", {
						className: "cs-slider",
						type: "range",
						min: props.min,
						max: props.max,
						step: props.step,
						value: props.value,
						"aria-label": props.label,
						"aria-valuetext": props.display,
						onInput: (event) => props.onChange(Number(event.currentTarget.value))
					}),
					jsx("output", { className: "cs-value", children: props.display })
				]
			});
		}

		/**
		 * One independent base-color row: a full-spectrum native color picker plus
		 * its own opacity slider and a reset back to the theme-derived fill.
		 *
		 * The native input opens the operating system / browser color wheel, which
		 * is the full-gamut picker users already know, so no custom wheel is needed.
		 * While no explicit color is set the swatch previews the inherited fill, and
		 * `color` is emitted as `null` to hand the surface back to the scheme.
		 */
		function ColorRow(props) {
			var t = props.t;
			var color = props.color;
			var alpha = props.alpha;
			var inherited = props.inherited;
			var onColor = props.onColor;
			var onAlpha = props.onAlpha;
			var disabled = props.disabled === true;

			// The picker needs a concrete value; fall back to the inherited fill.
			var pickerValue = color || inherited;
			var isCustom = color !== null && color !== "";

			return jsx("div", {
				className: "cs-color" + (disabled ? " cs-color--disabled" : ""),
				children: [
					jsx("div", {
						className: "cs-row",
						children: [
							jsx("span", { className: "cs-row-label", children: props.label }),
							jsx("input", {
								className: "cs-color__picker",
								type: "color",
								value: pickerValue,
								disabled: disabled,
								"aria-label": props.label,
								onInput: (event) => onColor(event.currentTarget.value)
							}),
							jsx("code", { className: "cs-color__hex", children: isCustom ? color : t("colorInherit") }),
							jsx("button", {
								type: "button",
								className: "cs-button cs-button--ghost cs-color__reset",
								disabled: disabled || !isCustom,
								onClick: () => onColor(null),
								children: t("colorAuto")
							})
						]
					}),
					jsx("div", {
						className: "cs-row",
						children: [
							jsx("span", { className: "cs-row-label", children: t("colorAlpha") }),
							jsx("input", {
								className: "cs-slider",
								type: "range",
								min: 0,
								max: 100,
								step: 1,
								value: alpha,
								disabled: disabled,
								"aria-label": props.label + " " + t("colorAlpha"),
								"aria-valuetext": alpha + "%",
								onInput: (event) => onAlpha(Number(event.currentTarget.value))
							}),
							jsx("output", { className: "cs-value", children: alpha + "%" })
						]
					})
				]
			});
		}

		/**
		 * The settings surface for the custom skin: background image picker,
		 * image filters (contrast / brightness / blur), and the readability
		 * controls (wash opacity and surface opacity).
		 */
		function CustomSkinRow(props) {
			var t = props.t;
			var scope = props.scope;
			var snapshot = React.useSyncExternalStore(scope.subscribe, scope.getSnapshot);
			var [busy, setBusy] = React.useState(false);
			var [urlDraft, setUrlDraft] = React.useState("");
			var fileRef = React.useRef(null);

			var pickFile = function () {
				if (fileRef.current !== null) fileRef.current.click();
			};

			var onFileChosen = function (event) {
				var file = event.target.files && event.target.files[0];
				event.target.value = "";
				if (!file) return;
				setBusy(true);
				var isVideo = /^video\/mp4$/i.test(file.type);
				var reader = isVideo ? readVideoFile(file) : readImageFile(file);
				reader
					.then(function (dataUrl) { scope.setImage(dataUrl, isVideo ? "video" : "file"); })
					.catch(function (error) {
						try {
							window.alert(t(error && error.message === "NOT_IMAGE" ? "error.notImage"
								: error && error.message === "NOT_VIDEO" ? "error.notVideo"
								: "error.readFailed"));
						} catch { /* alerts may be blocked */ }
					})
					.finally(function () { setBusy(false); });
			};

			var applyUrl = function () {
				var value = urlDraft.trim();
				if (value === "") return;
				if (!isSafeMediaUrl(value)) {
					try { window.alert(t("error.urlInvalid")); } catch { /* ignore */ }
					return;
				}
				var isVideo = /^data:video\//i.test(value) || /\.mp4(\?|#|$)/i.test(value);
				scope.setImage(value, isVideo ? "video" : "url");
			};

			var enabled = snapshot.enabled;
			var hasImage = snapshot.image !== null;
			var toneText = snapshot.detectedTone === "light" ? t("toneLight")
				: snapshot.detectedTone === "dark" ? t("toneDark")
				: t("toneUnknown");

			return jsx("div", {
				className: "cs-group",
				"data-plugin": PACKAGE_ID,
				children: [
					jsx("div", { className: "cs-title", children: t("title") }),
					jsx("div", { className: "cs-hint", children: t("hint") }),

					// Enable / disable.
					jsx("div", {
						className: "cs-row",
						children: [
							jsx("span", { className: "cs-row-label", children: t("enable") }),
							jsx("button", {
								type: "button",
								className: "cs-switch",
								"aria-pressed": String(enabled),
								"aria-label": t("enable"),
								onClick: () => scope.setEnabled(!enabled),
								children: jsx("span", { className: "cs-switch__knob" })
							})
						]
					}),

					// Automatic appearance: follow the background image's tone.
					jsx("div", {
						className: "cs-row",
						children: [
							jsx("span", { className: "cs-row-label", children: t("autoTheme") }),
							jsx("button", {
								type: "button",
								className: "cs-switch",
								"aria-pressed": String(snapshot.autoTheme),
								"aria-label": t("autoTheme"),
								onClick: () => scope.setAutoTheme(!snapshot.autoTheme),
								children: jsx("span", { className: "cs-switch__knob" })
							})
						]
					}),
					jsx("div", {
						className: "cs-hint",
						children: t("detected") + "：" + toneText
					}),
					jsx("div", { className: "cs-hint", children: t("autoThemeHint") }),

					// Background image.
					jsx("div", {
						className: "cs-row",
						style: { alignItems: "flex-start", flexDirection: "column", gap: "10px" },
						children: [
							jsx("div", {
								className: "cs-row",
								style: { width: "100%" },
								children: [
									jsx("span", { className: "cs-row-label", children: t("image") }),
									jsx("div", {
										className: "cs-actions",
										children: [
											jsx("button", {
												type: "button",
												className: "cs-button cs-button--primary",
												disabled: busy,
												onClick: pickFile,
												children: t("choose")
											}),
											hasImage
												? jsx("button", {
													type: "button",
													className: "cs-button cs-button--danger",
													disabled: busy,
													onClick: () => scope.clearImage(),
													children: t("remove")
												})
												: null
										]
									})
								]
							}),
							jsx("input", {
								ref: fileRef,
								type: "file",
								accept: "image/*,video/mp4",
								hidden: true,
								onChange: onFileChosen
							}),
							// URL entry.
							jsx("div", {
								className: "cs-url-row",
								children: [
									jsx("input", {
										className: "cs-url",
										type: "text",
										inputMode: "url",
										placeholder: t("urlPlaceholder"),
										value: urlDraft,
										onChange: (event) => setUrlDraft(event.currentTarget.value),
										onKeyDown: (event) => { if (event.key === "Enter") applyUrl(); }
									}),
									jsx("button", {
										type: "button",
										className: "cs-button",
										disabled: busy || urlDraft.trim() === "",
										onClick: applyUrl,
										children: t("apply")
									})
								]
							}),
							// Preview.
							hasImage
								? jsx("div", {
									className: "cs-preview",
									children: snapshot.kind === "video"
										? jsx("video", { src: snapshot.image, alt: "", playsInline: true, muted: true, autoPlay: true, loop: true, style: { width: "100%", height: "100%", objectFit: "cover" } })
										: jsx("img", { src: snapshot.image, alt: "" })
								})
								: jsx("div", { className: "cs-preview cs-preview--empty", children: t("noImage") })
						]
					}),

					// Image filters.
					jsx(SliderRow, {
						label: t("contrast"),
						min: 50,
						max: 200,
						step: 5,
						value: snapshot.contrast,
						display: snapshot.contrast + "%",
						onChange: (value) => scope.setContrast(value)
					}),
					jsx(SliderRow, {
						label: t("brightness"),
						min: 50,
						max: 150,
						step: 5,
						value: snapshot.brightness,
						display: snapshot.brightness + "%",
						onChange: (value) => scope.setBrightness(value)
					}),
					jsx(SliderRow, {
						label: t("blur"),
						min: 0,
						max: 30,
						step: 1,
						value: snapshot.blur,
						display: snapshot.blur + "px",
						onChange: (value) => scope.setBlur(value)
					}),

					// Readability controls.
					jsx(SliderRow, {
						label: t("wash"),
						min: 0,
						max: 100,
						step: 5,
						value: snapshot.wash,
						display: snapshot.wash + "%",
						onChange: (value) => scope.setWash(value)
					}),
					jsx(SliderRow, {
						label: t("surface"),
						min: 30,
						max: 100,
						step: 2,
						value: snapshot.surface,
						display: snapshot.surface + "%",
						onChange: (value) => scope.setSurface(value)
					}),
					jsx(SliderRow, {
						label: t("sidebar"),
						min: 0,
						max: 100,
						step: 5,
						value: snapshot.sidebar,
						display: snapshot.sidebar + "%",
						onChange: (value) => scope.setSidebar(value)
					}),
					jsx("div", { className: "cs-hint", children: t("sidebarHint") }),

					// Sidebar base color: full-spectrum picker and its own opacity.
					jsx("div", { className: "cs-subtitle", children: t("colorSection") }),
					ColorRow({
						t: t,
						label: t("sidebarColor"),
						color: snapshot.sidebarColor || null,
						alpha: snapshot.sidebarColorAlpha,
						inherited: schemeHex(snapshot, "sidebar"),
						onColor: (value) => scope.setSidebarColor(value),
						onAlpha: (value) => scope.setSidebarColorAlpha(value)
					}),
					jsx("div", { className: "cs-hint", children: t("colorHint") }),

					jsx("div", {
						className: "cs-actions",
						children: jsx("button", {
							type: "button",
							className: "cs-button cs-button--ghost",
							onClick: () => scope.reset(),
							children: t("reset")
						})
					})
				]
			});
		}
		/**
		 * The `settings.section` occupant for the custom skin: it renders the
		 * section's own column and projects its child item slot, exactly like the
		 * shipped General section does.
		 */
		function CustomSkinSection(props) {
			return jsx("div", {
				className: "cs-section",
				children: props.renderSlot("settings.customSkin.item", {})
			});
		}
		//#endregion

		//#region plugin body
		var inject = ["slots", "locale", "theme"];

		function apply(ctx) {
			try {
				var disposeStyle = installStyles();
				ctx.effect(() => disposeStyle, "custom-skin: scoped styles");

				var themeService = null;
				try { themeService = ctx.get("theme"); } catch { /* theme service optional */ }

				var scope = createPreferenceStore();
				ctx.effect(() => () => scope.dispose(), "custom-skin: preferences");

				var presenter = createPresenter(scope, themeService);
				ctx.effect(() => () => presenter.dispose(), "custom-skin: backdrop");

				// Re-derive the surface palette when light/dark flips.
				ctx.effect(function () {
					var disposers = [];
					try {
						var handler = function () { presenter.apply(); };
						if (typeof ctx.on === "function") {
							var off = ctx.on("theme/change", handler);
							if (typeof off === "function") disposers.push(off);
						}
						var observer = new MutationObserver(function () { presenter.apply(); });
						observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
						disposers.push(function () { observer.disconnect(); });
					} catch { /* ignore */ }
					return function () {
						for (var dispose of disposers) {
							try { dispose(); } catch { /* ignore */ }
						}
					};
				}, "custom-skin: theme sync");

				ctx.effect(() => ctx.locale.register(NS, {
					zh: {
						title: "自定义皮肤",
						hint: "设置自己的背景图片，并调节对比度让界面更好看、更易读。",
						enable: "启用自定义皮肤",
						image: "背景图片",
						choose: "选择图片",
						remove: "移除图片",
						apply: "应用",
						urlPlaceholder: "粘贴图片链接（https://…）",
						noImage: "尚未设置背景图片",
						contrast: "图片对比度",
						brightness: "图片亮度",
						blur: "图片模糊",
						wash: "可读性遮罩",
						surface: "界面不透明度",
						sidebar: "侧边栏透明度",
						sidebarHint: "0% 时侧边栏完全不透明（看不到背景图），100% 时侧边栏完全透明。",
						colorSection: "侧边栏底色",
						sidebarColor: "侧边栏底色",
						colorAlpha: "颜色不透明度",
						colorInherit: "跟随主题",
						colorAuto: "自动",
						colorHint: "默认跟随当前主题；点击色块打开全色系调色盘，调节该颜色的不透明度。只有侧边栏与聊天输入区可自定义颜色，其它 UI（设置、安装插件等弹窗）始终保持主题纯色。",
						sectionNav: "自定义皮肤",
						autoTheme: "自动匹配外观",
						autoThemeHint: "上传或更换背景图后，按图片整体色调自动把「通用设置 → 外观」设为浅色或深色。",
						detected: "当前背景识别为",
						toneLight: "浅色",
						toneDark: "深色",
						toneUnknown: "未识别（跨域图片无法读取像素）",
						reset: "恢复默认",
						"error.notImage": "请选择图片文件。",
						"error.notVideo": "请选择 MP4 视频文件。",
						"error.readFailed": "图片读取失败，请换一张试试。",
						"error.urlInvalid": "图片链接无效，请使用 https:// 开头的地址或 data:image 数据。"
					},
					en: {
						title: "Custom skin",
						hint: "Use your own background image and tune contrast so the UI stays beautiful and readable.",
						enable: "Enable custom skin",
						image: "Background image",
						choose: "Choose image",
						remove: "Remove image",
						apply: "Apply",
						urlPlaceholder: "Paste an image URL (https://…)",
						noImage: "No background image set",
						contrast: "Image contrast",
						brightness: "Image brightness",
						blur: "Image blur",
						wash: "Readability veil",
						surface: "Surface opacity",
						sidebar: "Sidebar transparency",
						sidebarHint: "0% keeps the sidebar fully opaque (no image behind it); 100% makes it fully transparent.",
						colorSection: "Sidebar base color",
						sidebarColor: "Sidebar base color",
						colorAlpha: "Color opacity",
						colorInherit: "Follows theme",
						colorAuto: "Auto",
						colorHint: "By default it follows the current theme. Click a swatch to open the full-spectrum picker and set its opacity. Only the sidebar and the chat typing area can be customized; all other UI (settings, plugin installation, etc.) always keeps the theme's solid color.",
						sectionNav: "Custom skin",
						autoTheme: "Match appearance automatically",
						autoThemeHint: "After a background image is set, the Appearance preference follows the image tone — light for bright images, dark for dim ones.",
						detected: "Detected background tone",
						toneLight: "light",
						toneDark: "dark",
						toneUnknown: "not detected (cross-origin pixels are unreadable)",
						reset: "Reset to defaults",
						"error.notImage": "Please choose an image file.",
						"error.notVideo": "Please choose an MP4 video file.",
						"error.readFailed": "Could not read that image. Try another one.",
						"error.urlInvalid": "Invalid image URL. Use an https:// address or a data:image payload."
					}
				}), "custom-skin: locale");

				// The section's nav label is resolved lazily at render time, so bind
				// the translator only after its dictionary is registered above.
				var t = ctx.locale && typeof ctx.locale.bind === "function"
					? ctx.locale.bind(NS)
					: function (key) { return key; };

				// A dedicated left-nav entry instead of a row inside General: the
				// whole custom-skin surface lives here, with the section owning its
				// own child item slot.
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "custom-skin",
					order: 12,
					label: () => t("sectionNav"),
					locale: NS,
					children: { "settings.customSkin.item": {
						kind: "list",
						scope: "root"
					} }
				}, CustomSkinSection));

				ctx.slots.inject("settings.customSkin.item", () => ctx.slots.register({
					name: "settings.customSkin.item",
					id: "custom-skin",
					order: 10,
					locale: NS,
					inject: () => ({ scope: scope })
				}, CustomSkinRow));
			} catch (error) {
				// Never take the shell down; go invisible but keep a breadcrumb.
				try { console.warn("[dsh-client-custom-skin] disabled for this session:", error && error.message); } catch { /* ignore */ }
				exports.apply = () => {};
				exports.inject = [];
			}
		}

		exports.apply = apply;
		exports.inject = inject;

		return module.exports;
	}
});
