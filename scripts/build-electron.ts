import * as esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function build() {
    await esbuild.build({
        entryPoints: [path.join(root, "electron/preload.ts")],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: path.join(root, "electron/preload.cjs"),
        format: "cjs",
        external: ["electron"],
    });

    await esbuild.build({
        entryPoints: [path.join(root, "electron/renderer/renderer.ts")],
        bundle: true,
        target: "es2020",
        outfile: path.join(root, "electron/renderer/renderer.js"),
        format: "iife",
    });

    await esbuild.build({
        entryPoints: [path.join(root, "assets/overlay-client.ts")],
        bundle: true,
        target: "es2020",
        outfile: path.join(root, "assets/overlay-client.js"),
        format: "iife",
    });

    console.log("Built preload.cjs, renderer.js, and overlay-client.js");
}

build();
