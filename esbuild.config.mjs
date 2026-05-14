import { build } from "esbuild";

await build({
  entryPoints: ["src/runtime.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/runtime.mjs",
  target: "node18",
  external: [],
  minify: false,
  banner: {
    js: '// self-evolution runtime — auto-generated bundle\n',
  },
});

console.log("Built dist/runtime.mjs");
