import * as fs from "fs";
import { Style, DEFAULT_STYLE, DEFAULT_PRESETS } from "../../types";

function presetsToStyles(
    presets: Record<string, { style: Style }>
): Record<string, Style> {
    const result: Record<string, Style> = {};
    for (const [key, value] of Object.entries(presets)) {
        result[key] = value.style;
    }
    return result;
}

export class StyleManagerService {
    async loadPresets(presetsPath: string): Promise<Record<string, Style>> {
        if (!fs.existsSync(presetsPath)) {
            const presets = presetsToStyles(DEFAULT_PRESETS);
            await this.savePresets(presetsPath, presets);
            return presets;
        }

        try {
            const data = JSON.parse(
                await fs.promises.readFile(presetsPath, "utf-8")
            );
            if (typeof data === "object" && data !== null) {
                return data as Record<string, Style>;
            }
        } catch {
            // Ignore
        }

        const presets = presetsToStyles(DEFAULT_PRESETS);
        await this.savePresets(presetsPath, presets);
        return presets;
    }

    async savePresets(
        presetsPath: string,
        presets: Record<string, Style>
    ): Promise<void> {
        try {
            await fs.promises.writeFile(
                presetsPath,
                JSON.stringify(presets, null, 2)
            );
        } catch {
            // Ignore
        }
    }

    applyStyle(base: Style, updates: Partial<Style>): Style {
        return { ...base, ...updates };
    }
}
