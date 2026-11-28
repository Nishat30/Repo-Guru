import "@testing-library/jest-dom/vitest";

// Polyfill scrollIntoView for jsdom
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
