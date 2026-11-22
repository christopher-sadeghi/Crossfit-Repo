import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, react, browser = {}, nextNavigation = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const modules = { react, "react/jsx-runtime": { jsx: () => null }, "next/navigation": nextNavigation };
  const exports = {};
  new Function("require", "exports", ...Object.keys(browser), outputText)(
    (id) => modules[id], exports, ...Object.values(browser),
  );
  return exports;
}

test("the Settings demo section scrolls on mount only for its fragment", () => {
  for (const hash of ["", "#another-section", "#demo-data"]) {
    let scrolls = 0;
    let mount;
    const { DemoDataSection } = load("app/(app)/settings/demo-data-section.tsx", {
      useEffect: (effect) => { mount = effect; },
      useRef: () => ({ current: { scrollIntoView: () => { scrolls++; } } }),
    }, { window: { location: { hash } } });
    DemoDataSection({ children: null });
    assert.equal(scrolls, 0);
    mount();
    assert.equal(scrolls, hash === "#demo-data" ? 1 : 0);
  }
});

test("a returning tab syncs a changed timezone before refreshing its server content", () => {
  let zone = "UTC";
  let visibilityChange;
  const cookiesAtRefresh = [];
  const document = {
    cookie: "tz=UTC",
    visibilityState: "visible",
    addEventListener(type, listener) {
      assert.equal(type, "visibilitychange");
      visibilityChange = listener;
    },
    removeEventListener(type, listener) {
      assert.equal(type, "visibilitychange");
      assert.equal(listener, visibilityChange);
      visibilityChange = undefined;
    },
  };
  let cleanup;
  const { TimeZoneSync } = load("components/time-zone-sync.tsx", {
    useEffect: (effect) => { cleanup = effect(); },
  }, {
    document,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: zone }) }) },
  }, { useRouter: () => ({ refresh: () => { cookiesAtRefresh.push(document.cookie.split(";")[0]); } }) });

  TimeZoneSync();
  assert.deepEqual(cookiesAtRefresh, []);
  document.visibilityState = "hidden";
  zone = "Pacific/Kiritimati";
  visibilityChange();
  assert.equal(document.cookie, "tz=UTC");
  assert.deepEqual(cookiesAtRefresh, []);
  document.visibilityState = "visible";
  visibilityChange();
  visibilityChange();
  assert.deepEqual(cookiesAtRefresh, ["tz=Pacific%2FKiritimati"]);

  zone = "UTC";
  document.cookie = "tz=UTC";
  visibilityChange();
  assert.deepEqual(cookiesAtRefresh, ["tz=Pacific%2FKiritimati", "tz=UTC"]);
  cleanup();
  assert.equal(visibilityChange, undefined);
});
