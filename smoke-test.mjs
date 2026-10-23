/**
 * Smoke test for @leon___/dsh-client-custom-skin.
 *
 * Simulates the DSH shell environment (window.__ModuleLoader__, localStorage,
 * a minimal DOM, and stub react / react/jsx-runtime) then:
 *   1. loads the client bundle factory,
 *   2. runs apply(ctx) against a fake client context,
 *   3. verifies the backdrop element, body attribute and CSS variables,
 *   4. exercises the preference store and the settings row component.
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
globalThis.Image = class {
	constructor() {
		this.naturalWidth = 1600;
		this.naturalHeight = 900;
		this.onload = null;
		this.onerror = null;
	}
	set src(_v) { /* no-op */ }
};
globalThis.FileReader = class {
	constructor() {}
	readAsDataURL() {
		this.result = "data:image/jpeg;base64,AAAA";
		setTimeout(() => this.onload && this.onload(), 0);
	}
};
globalThis.HTMLCanvasElement = class {};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.performance = { now: () => Date.now() };

// canvas support for the resize path
const fakeCanvas = () => ({
	width: 0,
	height: 0,
	getContext() { return { drawImage() {} }; },
	toDataURL() { return "data:image/jpeg;base64,AAAA"; }
});
const originalCreateElement = document_.createElement;
document_.createElement = function (tag) {
	if (tag === "canvas") return fakeCanvas();
	return originalCreateElement(tag);
};

// ---------------------------------------------------------------------------
// load + run
// ---------------------------------------------------------------------------
const code = readFileSync(here("./lib/client.js"), "utf8");
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

// Fake client context: enough of the cordis surface for apply().
const registeredSlots = [];
const localeNamespaces = [];
const effects = [];
const offHandlers = [];
const ctx = {
	get(name) { return name === "theme" ? { getTheme: () => ({ active: { colorScheme: "light" } }) } : undefined; },
	on(name, handler) {
		const off = () => {};
		offHandlers.push({ name, handler, off });
		return off;
	},
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
		}
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

assert(registry.id === "@leon___/dsh-client-custom-skin", "bundle id");
assert(localeNamespaces.some((x) => x.ns === "custom-skin"), "locale registered");
assert(registeredSlots.length === 1, "one settings row registered, got " + registeredSlots.length);
assert(registeredSlots[0].name === "settings.general.item", "slot name");
assert(registeredSlots[0].id === "custom-skin", "slot id");

// No image yet -> no backdrop, no body attribute.
assert(!document_.body.hasAttribute("data-cs-skin"), "no skin attribute before image");

// Write a preference through the store via the registered inject face.
const scope = registeredSlots[0].options.inject().scope;
assert(typeof scope.getSnapshot === "function", "scope snapshot");
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

// Render the row component (calls it directly; hooks are stubbed).
const row = registeredSlots[0].component({ t: (k) => k, scope });
assert(row && row.type === "div", "row renders a div");
const flat = JSON.stringify(row);
assert(flat.includes("cs-group"), "row has group class");
assert(flat.includes("contrast"), "row has contrast control");
assert(flat.includes("wash"), "row has wash control");
assert(flat.includes("sidebar"), "row has sidebar control");

// Sidebar transparency maps to the complement of the fill alpha.
scope.setSidebar(0);
let sidebar = document_.body.style.props.get("--cs-sidebar");
assert(/\/ 1\)$/.test(sidebar), "sidebar 0% must be fully opaque, got " + sidebar);
scope.setSidebar(100);
sidebar = document_.body.style.props.get("--cs-sidebar");
assert(/\/ 0\)$/.test(sidebar), "sidebar 100% must be fully transparent, got " + sidebar);
scope.setSidebar(40);
sidebar = document_.body.style.props.get("--cs-sidebar");
assert(sidebar.includes("0.6"), "sidebar 40% -> alpha 0.6, got " + sidebar);
// The general surface control must NOT drive the sidebar any more.
const before = document_.body.style.props.get("--cs-sidebar");
scope.setSurface(95);
assert(document_.body.style.props.get("--cs-sidebar") === before, "surface must not move sidebar");

// Disable -> skin attribute removed.
scope.setEnabled(false);
assert(!document_.body.hasAttribute("data-cs-skin"), "skin attribute removed on disable");

// Re-enable -> attribute back.
scope.setEnabled(true);
assert(document_.body.hasAttribute("data-cs-skin"), "skin attribute back on enable");

// Persistence round-trip.
assert(localStorage_._map.get("dsh-custom-skin:image") === "data:image/png;base64,AAAA", "image persisted");
assert(localStorage_._map.get("dsh-custom-skin:contrast") === "140", "contrast persisted");

// Reset keeps the image but restores filter defaults.
scope.reset();
assert(scope.getSnapshot().contrast === 100, "reset contrast");
assert(scope.getSnapshot().image === "data:image/png;base64,AAAA", "reset keeps image");

// Dispose effect cleanup without throwing.
for (const { dispose } of effects) {
	if (typeof dispose === "function") dispose();
}

console.log("SMOKE TEST PASSED — bundle id:", registry.id);
console.log("  slots:", registeredSlots.map((s) => s.id).join(", "));
console.log("  locales:", localeNamespaces.map((l) => l.ns).join(", "));
console.log("  sidebar alpha: 0% -> 1.0 | 100% -> 0.0 | 40% -> 0.6");
