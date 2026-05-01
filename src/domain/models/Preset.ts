import { Style, DEFAULT_STYLE } from "./Style.js";

export interface Preset {
    name: string;
    style: Style;
}

export const DEFAULT_PRESETS: Record<string, Preset> = {
    Default: { name: "Default", style: { ...DEFAULT_STYLE } },
    Stage: {
        name: "Stage",
        style: {
            fontSizePreset: "xl",
            alignment: "center",
            safeMargin: 120,
            animation: "fade",
            speakerLabel: "",
        },
    },
};
