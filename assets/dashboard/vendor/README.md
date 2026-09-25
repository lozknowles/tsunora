# Three.js browser dependency

Three.js 0.186.0, MIT; see `LICENSE`. Official source: https://github.com/mrdoob/three.js/tree/r186

The browser bundle is generated from the npm `three@0.186.0` package with the existing Agent Control esbuild 0.28.2 dependency:

```
npm pack three@0.186.0 --ignore-scripts
tar -xzf three-0.186.0.tgz
esbuild package/build/three.module.js --bundle --minify --format=esm --outfile=three.module.min.js
```

Package SHA-256: `61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa`.
Bundle SHA-256: `fba62dfd6f0cdf58c9647d9cfe6e83cec5cf98eb24a7677ad116f4c0fca33902` (742188 bytes).
Lazy-loaded on Factory activation only; no CDN, build step or graphics dependency for headless execution.
