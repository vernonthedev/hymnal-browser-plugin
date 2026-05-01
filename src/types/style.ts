export interface Style {
    fontSizePreset: string;
    alignment: string;
    safeMargin: number;
    animation: string;
    speakerLabel: string;
}

export const DEFAULT_STYLE: Style = {
    fontSizePreset: "md",
    alignment: "center",
    safeMargin: 80,
    animation: "pop",
    speakerLabel: "",
};

export function createStyle(partial: Partial<Style> = {}): Style {
    return { ...DEFAULT_STYLE, ...partial };
}
