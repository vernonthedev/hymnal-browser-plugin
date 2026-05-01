import { Style } from "./style";

export interface Preset {
    name: string;
    style: Style;
}

export const DEFAULT_PRESETS: Record<string, Preset> = {
    Default: {
        name: "Default",
        style: {
            fontSizePreset: "md",
            alignment: "center",
            safeMargin: 80,
            animation: "pop",
            speakerLabel: "",
        },
    },
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
