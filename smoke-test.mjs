/**
 * Smoke test for @leon___/dsh-client-custom-skin.
 *
 * Simulates the DSH shell environment (window.__ModuleLoader__, localStorage,
 * a minimal DOM, and stub react / react/jsx-runtime) then:
 *   1. loads the client bundle factory,
 *   2. runs apply(ctx) against a fake client context,
 *   3. verifies the dedicated settings section + child item slot,
 *   4. verifies the backdrop element, body attribute and CSS variables,
 *   5. verifies the sidebar-transparency mapping and its independence,
 *   6. verifies background-tone detection driving the Appearance preference,
 *   7. exercises the preference store and the settings row component.
 *
 * Run: node smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// ---------------------------------------------------------------------------
// Minimal DOM
// ---------------------------------------------------------------------------
function createClassList() {
	const set = new Set();
	return {
		add(...names) { for (const n of names) set.add(n); },
		remove(...names) { for (const n of names) set.delete(n); },
		contains(name) { return set.has(name); },
		toString() { return [...set].join(" "); }
	};
}

class FakeNode {
	constructor(tag = "div") {
		this.tag = tag;
		this.children = [];
		this.parent = null;
		this.attributes = new Map();
		this.style = {
			props: new Map(),
			setProperty(k, v) { this.props.set(k, v); },
			removeProperty(k) { this.props.delete(k); },
			getPropertyValue(k) { return this.props.get(k) ?? ""; }
		};
		this.dataset = {};
		this.classList = createClassList();
		this.hidden = false;
		this.textContent = "";
		this.value = "";
		this.files = null;
	}
	append(...nodes) {
		for (const n of nodes) {
			n.parent = this;
			this.children.push(n);
		}
	}
	appendChild(node) {
		node.parent = this;
		this.children.push(node);
		return node;
	}
	prepend(...nodes) {
		for (const n of nodes) {
			n.parent = this;
			this.children.unshift(n);
		}
	}
	insertBefore(node, ref) {
		const i = ref ? this.children.indexOf(ref) : -1;
		node.parent = this;
		if (i === -1) this.children.push(node);
		else this.children.splice(i, 0, node);
	}
	remove() {
		if (this.parent) {
			const i = this.parent.children.indexOf(this);
			if (i !== -1) this.parent.children.splice(i, 1);
			this.parent = null;
		}
	}
	contains(node) {
		if (node === this) return true;
		return this.children.some((c) => c.contains(node));
	}
	setAttribute(k, v) { this.attributes.set(k, String(v)); }
	getAttribute(k) { return this.attributes.get(k) ?? null; }
	removeAttribute(k) { this.attributes.delete(k); }
	hasAttribute(k) { return this.attributes.has(k); }
	addEventListener() {}
	removeEventListener() {}
	querySelector() { return null; }
	querySelectorAll() { return []; }
	focus() {}
	click() { this.clicked = (this.clicked ?? 0) + 1; }
}

function createDocument() {
	const body = new FakeNode("body");
	const head = new FakeNode("head");
	const html = new FakeNode("html");
	html.append(body);
	const doc = {
		head,
		body,
		documentElement: html,
		createElement(tag) { return new FakeNode(tag); },
		createTextNode(text) { const n = new FakeNode("#text"); n.textContent = text; return n; },
		querySelector() { return null; },
		querySelectorAll() { return []; },
		addEventListener() {},
		removeEventListener() {}
	};
	body.parent = html;
	return doc;
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------
function createLocalStorage() {
	const map = new Map();
	return {
		getItem(k) { return map.has(k) ? map.get(k) : null; },
		setItem(k, v) { map.set(k, String(v)); },
		removeItem(k) { map.delete(k); },
		clear() { map.clear(); },
		_map: map
	};
}

// ---------------------------------------------------------------------------
// stub react + jsx runtime
// ---------------------------------------------------------------------------
function createStubReact() {
	const React = {
		useState(init) {
			const value = typeof init === "function" ? init() : init;
			return [value, () => {}];
		},
		useRef(init) { return { current: init ?? null }; },
		useSyncExternalStore(subscribe, getSnapshot) {
			subscribe(() => {});
			return getSnapshot();
		},
		useEffect() {},
		useMemo(fn) { return fn(); },
		useCallback(fn) { return fn; }
	};
	const jsxRuntime = {
		jsx(type, props) { return { $$typeof: Symbol.for("react.element"), type, props: props ?? {} }; },
		jsxs(type, props) { return { $$typeof: Symbol.for("react.element"), type, props: props ?? {} }; },
		Fragment: Symbol.for("react.fragment")
	};
	return { React, jsxRuntime };
}

// ---------------------------------------------------------------------------
// environment + module loader
// ---------------------------------------------------------------------------
const document_ = createDocument();
const localStorage_ = createLocalStorage();

/** Pixel buffer handed back by the stubbed canvas getImageData(). */
const canvasPixels = new Uint8ClampedArray(32 * 32 * 4);
function fillPixels(r, g, b, a = 255) {
	for (let i = 0; i < canvasPixels.length; i += 4) {
		canvasPixels[i] = r;
		canvasPixels[i + 1] = g;
		canvasPixels[i + 2] = b;
		canvasPixels[i + 3] = a;
	}
}

const registry = { factory: null, id: null };
const window_ = {
	__ModuleLoader__: {
		load(entry) {
			registry.id = entry.id;
			registry.factory = entry.factory;
		}
	},
	localStorage: localStorage_,
	addEventListener() {},
	removeEventListener() {},
	alert(msg) { (window_.alerts ??= []).push(msg); },
	innerWidth: 1440,
	innerHeight: 900
};

globalThis.window = window_;
globalThis.document = document_;
globalThis.localStorage = localStorage_;
globalThis.MutationObserver = class {
	constructor(cb) { this.cb = cb; }
	observe() {}
	disconnect() {}
	takeRecords() { return []; }
};
// Real browsers fire onload asynchronously after a src assignment.
globalThis.Image = class {
	constructor() {
		this.naturalWidth = 1600;
		this.naturalHeight = 900;
		this.onload = null;
		this.onerror = null;
	}
	set src(_v) {
		const self = this;
		Promise.resolve().then(() => { if (typeof self.onload === "function") self.onload(); });
	}
};
globalThis.FileReader = class {
	readAsDataURL() {
		this.result = "data:image/jpeg;base64,AAAA";
		setTimeout(() => this.onload && this.onload(), 0);
	}
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.performance = { now: () => Date.now() };

// canvas support: the resize path (toDataURL) and the tone probe (getImageData)
const originalCreateElement = document_.createElement;
document_.createElement = function (tag) {
	if (tag === "canvas") {
		return {
			width: 0,
			height: 0,
			getContext() {
				return {
					drawImage() {},
					getImageData() { return { data: canvasPixels }; }
				};
			},
			toDataURL() { return "data:image/jpeg;base64,AAAA"; }
		};
	}
	return originalCreateElement(tag);
};

// ---------------------------------------------------------------------------
// load + run
// ---------------------------------------------------------------------------
const code = readFileSync(here("./lib/client.js"), "utf8");
// The bundle's outer scope takes these as parameters so the harness can supply
// them explicitly; every one must be passed or the name shadows the global.
const fn = new Function("window", "document", "localStorage", "MutationObserver", "Image", "FileReader", code);
fn(window_, document_, localStorage_, globalThis.MutationObserver, globalThis.Image, globalThis.FileReader);

if (typeof registry.factory !== "function") throw new Error("factory was not registered");
const { React, jsxRuntime } = createStubReact();
const requireStub = (id) => {
	if (id === "react") return React;
	if (id === "react/jsx-runtime") return jsxRuntime;
	throw new Error("unexpected require(" + JSON.stringify(id) + ")");
};
const exports_ = registry.factory(requireStub);

if (typeof exports_.apply !== "function") throw new Error("apply export missing");
if (!Array.isArray(exports_.inject)) throw new Error("inject export missing");

// --- fake client context -----------------------------------------------------
const registeredSlots = [];
const localeNamespaces = [];
const effects = [];
const themeCalls = [];
let themePreference = "light";
const themeStub = {
	getTheme() {
		return {
			preference: themePreference,
			active: { colorScheme: themePreference === "dark" ? "dark" : "light" }
		};
	},
	setTheme(id) {
		themeCalls.push(id);
		themePreference = id;
	}
};

const ctx = {
	get(name) { return name === "theme" ? themeStub : undefined; },
	on() { return () => {}; },
	off() {},
	effect(fn, label) {
		const dispose = fn();
		effects.push({ label, dispose });
		return dispose;
	},
	locale: {
		register(ns, dictionaries) {
			localeNamespaces.push({ ns, dictionaries });
			return () => {};
		},
		bind(ns) { return (key) => ns + ":" + key; }
	},
	slots: {
		inject(name, fn) { fn(); },
		register(options, component) {
			registeredSlots.push({ name: options.name, id: options.id, options, component });
			return () => {};
		}
	}
};

exports_.apply(ctx);

// ---------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------
const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

assert(registry.id === "@leon___/dsh-client-custom-skin", "bundle id");
assert(localeNamespaces.some((x) => x.ns === "custom-skin"), "locale registered");

// A dedicated settings section + its own child item slot (no longer in General).
const sectionSlot = registeredSlots.find((s) => s.name === "settings.section");
const itemSlot = registeredSlots.find((s) => s.name === "settings.customSkin.item");
assert(registeredSlots.length === 2, "exactly two slots registered, got " + registeredSlots.length);
assert(sectionSlot !== undefined, "settings.section registered");
assert(sectionSlot.id === "custom-skin", "section id");
assert(typeof sectionSlot.options.label === "function", "section label is a lazy translator");
assert(sectionSlot.options.label() === "custom-skin:sectionNav", "section nav copy resolves, got " + sectionSlot.options.label());
assert(sectionSlot.options.children["settings.customSkin.item"].kind === "list", "section declares the list child");
assert(itemSlot !== undefined, "settings.customSkin.item registered");
assert(itemSlot.id === "custom-skin", "item id");
assert(!registeredSlots.some((s) => s.name === "settings.general.item"), "General row must be gone");

// The section component projects its child slot.
const renderedSlots = [];
const sectionTree = sectionSlot.component({
	renderSlot(name) { renderedSlots.push(name); return { projected: name }; }
});
assert(renderedSlots.includes("settings.customSkin.item"), "section renders its child slot");
assert(JSON.stringify(sectionTree).includes("cs-section"), "section column class");

// Store surface from the item slot's injected face.
const scope = itemSlot.options.inject().scope;
assert(typeof scope.getSnapshot === "function", "scope snapshot");
assert(scope.getSnapshot().autoTheme === true, "autoTheme defaults on");
assert(scope.getSnapshot().detectedTone === null, "no tone before an image");

// No image yet -> no backdrop, no body attribute.
assert(!document_.body.hasAttribute("data-cs-skin"), "no skin attribute before image");

// --- set an image: backdrop appears ------------------------------------------
scope.setImage("data:image/png;base64,AAAA", "file");
scope.setContrast(140);
scope.setWash(55);

assert(document_.body.hasAttribute("data-cs-skin"), "skin attribute after image");
const root = document_.body.children.find((n) => n.className === "cs-root");
assert(root !== undefined, "backdrop root created");
assert(document_.body.style.props.get("--cs-contrast") === "1.4", "contrast var, got " + document_.body.style.props.get("--cs-contrast"));
assert(document_.body.style.props.get("--cs-wash").includes("0.55"), "wash var, got " + document_.body.style.props.get("--cs-wash"));
const imageEl = root.children.find((n) => n.className === "cs-image");
assert(imageEl !== undefined, "image layer created");
assert(typeof imageEl.style.backgroundImage === "string" && imageEl.style.backgroundImage.includes("data:image/png"), "image background set");

// --- sidebar transparency maps to the complement of the fill alpha -----------
scope.setSidebar(0);
let sidebar = document_.body.style.props.get("--cs-sidebar");
assert(/\/ 1\)$/.test(sidebar), "sidebar 0% must be fully opaque, got " + sidebar);
scope.setSidebar(100);
sidebar = document_.body.style.props.get("--cs-sidebar");
assert(/\/ 0\)$/.test(sidebar), "sidebar 100% must be fully transparent, got " + sidebar);
scope.setSidebar(40);
sidebar = document_.body.style.props.get("--cs-sidebar");
assert(sidebar.includes("0.6"), "sidebar 40% -> alpha 0.6, got " + sidebar);
const sideBefore = document_.body.style.props.get("--cs-sidebar");
scope.setSurface(95);
assert(document_.body.style.props.get("--cs-sidebar") === sideBefore, "surface must not move sidebar");

// --- automatic appearance: a bright image drives `light` ---------------------
fillPixels(255, 255, 255);
themePreference = "dark";             // start on the "wrong" side
themeCalls.length = 0;
await tick();
assert(scope.getSnapshot().detectedTone === "light", "bright image detected as light, got " + scope.getSnapshot().detectedTone);
assert(themeCalls.includes("light"), "Appearance driven to light, got " + JSON.stringify(themeCalls));

// --- automatic appearance: a dark image drives `dark` ------------------------
fillPixels(12, 14, 20);
themePreference = "light";
themeCalls.length = 0;
scope.setImage("data:image/png;base64,BBBB", "file");
await tick();
assert(scope.getSnapshot().detectedTone === "dark", "dark image detected as dark, got " + scope.getSnapshot().detectedTone);
assert(themeCalls.includes("dark"), "Appearance driven to dark, got " + JSON.stringify(themeCalls));

// --- turning auto-appearance off stops detection and clears the readout ------
scope.setAutoTheme(false);
await tick();
assert(scope.getSnapshot().detectedTone === null, "tone readout cleared when auto is off");
themeCalls.length = 0;
fillPixels(255, 255, 255);
scope.setImage("data:image/png;base64,CCCC", "file");
await tick();
assert(scope.getSnapshot().detectedTone === null, "no detection while auto is off");
assert(themeCalls.length === 0, "Appearance untouched while auto is off");
assert(localStorage_._map.get("dsh-custom-skin:auto-theme") === "0", "autoTheme persisted off");
scope.setAutoTheme(true);

// --- independent base colors: sidebar and dialog each get color + alpha ------
assert(scope.getSnapshot().sidebarColor === "", "no sidebar color by default");
assert(scope.getSnapshot().dialogColor === "", "no dialog color by default");
assert(document_.body.style.props.get("--cs-sidebar-fill") === undefined, "no sidebar fill var by default");

scope.setSidebarColor("#3366ff");
scope.setSidebarColorAlpha(40);
let fill = document_.body.style.props.get("--cs-sidebar-fill");
assert(fill === "rgb(51 102 255 / 0.4)", "sidebar fill honors color + alpha, got " + fill);

scope.setDialogColor("#ff8800");
scope.setDialogColorAlpha(75);
let dialogFill = document_.body.style.props.get("--cs-dialog-fill");
assert(dialogFill === "rgb(255 136 0 / 0.75)", "dialog fill honors color + alpha, got " + dialogFill);
assert(document_.body.style.props.get("--cs-sidebar-fill") === fill, "dialog color must not move sidebar");

// 3-digit hex and range clamping.
scope.setSidebarColor("#0af");
assert(document_.body.style.props.get("--cs-sidebar-fill") === "rgb(0 170 255 / 0.4)", "3-digit hex expands, got " + document_.body.style.props.get("--cs-sidebar-fill"));
scope.setDialogColorAlpha(500);
assert(scope.getSnapshot().dialogColorAlpha === 100, "alpha clamps to 100");

// Clearing a color hands the surface back to the theme.
scope.setSidebarColor(null);
assert(document_.body.style.props.get("--cs-sidebar-fill") === undefined, "sidebar fill var removed when auto");
// Invalid hex is ignored by apply() rather than emitting a broken value.
scope.setDialogColor("not-a-color");
assert(document_.body.style.props.get("--cs-dialog-fill") === undefined, "invalid hex yields no dialog fill");
scope.setDialogColor("#ff8800");

// --- the dialog opacity slider must work while the color is still "auto" -----
// Regression guard: an auto color used to clear the fill entirely, which left
// the opacity slider inert and the settings panel stuck on an opaque theme fill.
scope.setDialogColor(null);
scope.setDialogColorAlpha(78);
assert(!scope.getSnapshot().dialogColor, "dialog color is auto");
assert(scope.getSnapshot().dialogMatchSidebar === false, "mirror off");
const autoFill = document_.body.style.props.get("--cs-dialog-fill");
assert(typeof autoFill === "string" && /\/ 0\.78\)$/.test(autoFill), "auto dialog fill carries the default opacity, got " + autoFill);
scope.setDialogColorAlpha(30);
assert(/\/ 0\.3\)$/.test(document_.body.style.props.get("--cs-dialog-fill")), "opacity slider changes the auto dialog fill, got " + document_.body.style.props.get("--cs-dialog-fill"));
scope.setDialogColorAlpha(78);

// --- "Same as sidebar": the dialog mirrors BOTH color and opacity ------------
assert(scope.getSnapshot().dialogMatchSidebar === false, "dialog mirror off by default");
scope.setSidebarColor("#3366ff");
scope.setSidebarColorAlpha(40);
scope.setDialogColor("#ff8800");
scope.setDialogColorAlpha(75);
scope.setDialogMatchSidebar(true);
assert(scope.getSnapshot().dialogMatchSidebar === true, "mirror flag persists in snapshot");
fill = document_.body.style.props.get("--cs-dialog-fill");
assert(fill === "rgb(51 102 255 / 0.4)", "dialog mirrors the sidebar color AND its opacity, got " + fill);

// The sidebar itself must stay untouched while mirroring.
assert(document_.body.style.props.get("--cs-sidebar-fill") === "rgb(51 102 255 / 0.4)", "sidebar unaffected by mirroring");

// Changing the sidebar while mirrored keeps the dialog in lockstep.
scope.setSidebarColorAlpha(90);
assert(document_.body.style.props.get("--cs-dialog-fill") === "rgb(51 102 255 / 0.9)", "mirrored dialog tracks later sidebar edits, got " + document_.body.style.props.get("--cs-dialog-fill"));

// With no custom sidebar color, the mirror copies the sidebar's EFFECTIVE fill
// (scheme color at the sidebar transparency slider), not "nothing".
scope.setSidebarColor(null);
assert(
	document_.body.style.props.get("--cs-dialog-fill") === document_.body.style.props.get("--cs-sidebar"),
	"mirror with auto sidebar copies the slider-driven sidebar fill, got "
		+ document_.body.style.props.get("--cs-dialog-fill")
		+ " vs " + document_.body.style.props.get("--cs-sidebar")
);

// Turning the mirror back off restores the dialog's own color.
scope.setSidebarColor("#3366ff");
scope.setDialogMatchSidebar(false);
assert(document_.body.style.props.get("--cs-dialog-fill") === "rgb(255 136 0 / 0.75)", "dialog returns to its own color, got " + document_.body.style.props.get("--cs-dialog-fill"));
assert(localStorage_._map.get("dsh-custom-skin:dialog-match-sidebar") === "0", "mirror flag persisted");

// Leave sidebar on "auto" and restore the dialog alpha so the pre-existing
// persistence assertions below still describe the same state.
scope.setSidebarColor(null);
scope.setDialogColorAlpha(100);

// --- the dialog fill also covers the composer / typing area ------------------
// The injected stylesheet lives in <style> tags; read them from the document head.
const styleText = document_.head.children.map((n) => n.textContent || "").join("\n");
assert(styleText.length > 0, "the scoped stylesheet was injected into <head>");
assert(styleText.includes("--dsw-specific-input-major:var(--cs-dialog-fill"), "composer/typing token follows the dialog fill");
assert(styleText.includes("--dsw-alias-bg-layer-2:var(--cs-dialog-fill"), "dialog panel token follows the dialog fill");
assert(styleText.includes("--dsw-specific-sidebar-fill:var(--cs-sidebar-fill"), "sidebar token stays independent");

// --- the Settings modal is exempt: it must stay solid theme black/white ------
// The shell marks the settings panel with the stable data-shortcut-modal hook.
assert(styleText.includes("[data-shortcut-modal='settings']"), "settings panel exclusion rule exists");
const lightReset = /html body\[data-cs-skin='on'\] \[data-shortcut-modal='settings'\]\{([^}]*)\}/.exec(styleText);
const darkReset = /html body\[data-cs-skin='on'\]\[data-ds-dark-theme\] \[data-shortcut-modal='settings'\]\{([^}]*)\}/.exec(styleText);
assert(lightReset !== null, "light reset rule for the settings panel");
assert(darkReset !== null, "dark reset rule for the settings panel");
// Every token the skin overrides must be restored inside the panel.
for (const tok of ["--dsw-alias-bg-layer-1", "--dsw-alias-bg-layer-2", "--dsw-alias-bg-layer-3", "--dsw-specific-sidebar-fill", "--dsw-specific-input-major", "--dsw-specific-menu", "--dsw-alias-bg-module-platform"]) {
	assert(lightReset[1].includes(tok + ":"), "light reset restores " + tok);
	assert(darkReset[1].includes(tok + ":"), "dark reset restores " + tok);
}
// And they must resolve to the theme's SOLID static palette, not the skin vars.
assert(lightReset[1].includes("--dsw-alias-bg-layer-2:var(--dsw-static-neutral-bluish-00)"), "light panel = solid theme white");
assert(darkReset[1].includes("--dsw-alias-bg-layer-2:var(--dsw-static-neutral-bluish-850)"), "dark panel = solid theme dark");
assert(!lightReset[1].includes("--cs-"), "panel reset must not reference skin variables");
assert(!darkReset[1].includes("--cs-"), "panel reset must not reference skin variables");

// Both colors survive a persistence round-trip.
assert(localStorage_._map.get("dsh-custom-skin:sidebar-color") === "", "sidebar color persisted as auto");
assert(localStorage_._map.get("dsh-custom-skin:dialog-color") === "#ff8800", "dialog color persisted");
assert(localStorage_._map.get("dsh-custom-skin:dialog-color-alpha") === "100", "dialog alpha persisted");

// --- render the row component (called directly; hooks are stubbed) -----------
const row = itemSlot.component({ t: (k) => k, scope });
assert(row && row.type === "div", "row renders a div");
const flat = JSON.stringify(row);
for (const needle of ["cs-group", "contrast", "wash", "sidebar", "autoTheme", "cs-color__picker", "colorInherit"]) {
	assert(flat.includes(needle), "row has " + needle);
}

// --- disable / re-enable -----------------------------------------------------
scope.setEnabled(false);
assert(!document_.body.hasAttribute("data-cs-skin"), "skin attribute removed on disable");
scope.setEnabled(true);
assert(document_.body.hasAttribute("data-cs-skin"), "skin attribute back on enable");

// --- persistence round-trip --------------------------------------------------
assert(localStorage_._map.get("dsh-custom-skin:image") === "data:image/png;base64,CCCC", "image persisted");
assert(localStorage_._map.get("dsh-custom-skin:contrast") === "140", "contrast persisted");

// --- reset keeps the image, restores filter defaults -------------------------
scope.reset();
assert(scope.getSnapshot().contrast === 100, "reset contrast");
assert(scope.getSnapshot().sidebar === 15, "reset sidebar");
assert(scope.getSnapshot().image === "data:image/png;base64,CCCC", "reset keeps image");
assert(scope.getSnapshot().sidebarColor === null, "reset clears sidebar color");
assert(scope.getSnapshot().dialogColor === null, "reset clears dialog color");
assert(scope.getSnapshot().dialogMatchSidebar === false, "reset clears the mirror flag");
assert(localStorage_._map.get("dsh-custom-skin:sidebar-color") === "", "reset persists the cleared sidebar color");
assert(localStorage_._map.get("dsh-custom-skin:dialog-color") === "", "reset persists the cleared dialog color");
assert(localStorage_._map.get("dsh-custom-skin:dialog-match-sidebar") === "0", "reset persists the mirror flag");
assert(localStorage_._map.get("dsh-custom-skin:dialog-color-alpha") === "78", "reset restores the default dialog opacity");

// --- dispose every effect without throwing ----------------------------------
for (const { dispose } of effects) {
	if (typeof dispose === "function") dispose();
}

console.log("SMOKE TEST PASSED — bundle id:", registry.id);
console.log("  slots    :", registeredSlots.map((s) => s.name + "#" + s.id).join(", "));
console.log("  locales  :", localeNamespaces.map((l) => l.ns).join(", "));
console.log("  section  :", sectionSlot.options.label());
console.log("  detected :", scope.getSnapshot().detectedTone, "| appearance calls:", JSON.stringify(themeCalls));