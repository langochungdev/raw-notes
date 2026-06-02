module.exports = [
  {
    ignores: ["node_modules/", "dist/", "vendor/"],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        chrome: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        Promise: "readonly",
        URL: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        IntersectionObserver: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        AbortController: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        requestAnimationFrame: "readonly",
        crypto: "readonly",
        HTMLInputElement: "readonly",
        HTMLAnchorElement: "readonly",
        DOMParser: "readonly",
        CustomEvent: "readonly",
        URLSearchParams: "readonly",
        indexedDB: "readonly",
        queueMicrotask: "readonly",
        module: "readonly",
        require: "readonly",
        history: "readonly",
        Audio: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];
