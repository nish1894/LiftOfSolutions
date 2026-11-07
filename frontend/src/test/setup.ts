import "@testing-library/jest-dom/vitest";

// jsdom doesn't scroll; the public pages scroll to the top when they open.
window.scrollTo = () => {};
