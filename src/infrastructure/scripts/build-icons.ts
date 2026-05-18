import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = process.cwd();

const sourceDir = path.join(projectRoot, "assets");
const outputDir = path.join(projectRoot, "assets/icons");

function runIconGen(input: string, output: string, args: string[]): void {
    execSync(`npx icon-gen -i ${input} -o ${output} ${args.join(" ")} -r`, {
        stdio: "inherit",
        cwd: projectRoot,
    });
}

async function buildIcons() {
    console.log("Building application icons...");
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Output directory: ${outputDir}`);

    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`  Created output directory: ${outputDir}`);
        }

        const logoSource = path.join(sourceDir, "logo-colored.png");

        if (!fs.existsSync(logoSource)) {
            console.error("  Source logo not found at assets/logo-colored.png");
            process.exit(1);
        }

        const filesToCopy = [
            { source: "logo-colored.png", dest: "app.png" },
            { source: "logo-transparent.png", dest: "app-transparent.png" },
            { source: "favicon.png", dest: "favicon.png" },
        ];

        for (const { source, dest } of filesToCopy) {
            const sourcePath = path.join(sourceDir, source);
            const destPath = path.join(outputDir, dest);

            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`  Copied ${source} -> ${dest}`);
            } else {
                console.warn(`  Source file not found: ${sourcePath}`);
            }
        }

        console.log("  Generating app.ico via icon-gen...");
        runIconGen(logoSource, outputDir, ["--ico", "--ico-name", "app"]);

        console.log("  Generating app.icns via icon-gen...");
        runIconGen(logoSource, outputDir, ["--icns", "--icns-name", "app"]);

        console.log("Icons built successfully!");
        console.log(`Output directory: ${outputDir}`);
    } catch (error) {
        console.error("Failed to build icons:", error);
        process.exit(1);
    }
}

buildIcons();
