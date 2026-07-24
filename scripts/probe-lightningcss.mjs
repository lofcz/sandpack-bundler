import init, { transform, bundleAsync } from "lightningcss-wasm";

await init();
const enc = new TextEncoder();
const dec = new TextDecoder();

const samples = [
  "@layer theme, base, utilities; .x { color: red }",
  "@theme default { --color-x: oklch(50% 0.2 20); } .x { color: var(--color-x) }",
  ".a { color: red; & .b { color: blue } }",
];

for (const s of samples) {
  try {
    const r = transform({ filename: "t.css", code: enc.encode(s), minify: false });
    console.log("OK", dec.decode(r.code).slice(0, 100).replace(/\n/g, " "));
  } catch (e) {
    console.log("FAIL", e?.message ?? e, e?.loc);
  }
}

const entry = '@import "./other.css"; .root { display:flex }';
const other = "@theme default { --x: 1; } .y { color: red }";
try {
  const r = await bundleAsync({
    filename: "/app/styles.css",
    minify: false,
    resolver: {
      read(file) {
        if (file === "/app/styles.css") return entry;
        if (file.endsWith("other.css")) return other;
        throw new Error("missing " + file);
      },
      resolve(spec, from) {
        if (spec.startsWith(".")) {
          const dir = from.replace(/\/[^/]*$/, "");
          return `${dir}/${spec.replace(/^\.\//, "")}`;
        }
        return spec;
      },
    },
  });
  console.log("BUNDLE OK", dec.decode(r.code).slice(0, 160).replace(/\n/g, " "));
} catch (e) {
  console.log("BUNDLE FAIL", e?.message ?? e, e?.loc, e?.kind);
}
