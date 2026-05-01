import { Style } from "../models/Style";

export interface OverlayState {
    type: string;
    httpPort: number;
    wsPort: number;
    hymn: string;
    lineIndex: number;
    totalLines: number;
    text: string;
    visible: boolean;
    style: Style;
    connectedClients: number;
    controlClients: number;
    error: string;
}

export function createOverlayState(
    partial: Partial<OverlayState> = {}
): OverlayState {
    return {
        type: "state",
        httpPort: 0,
        wsPort: 0,
        hymn: "",
        lineIndex: 0,
        totalLines: 0,
        text: "",
        visible: true,
        style: {
            fontSizePreset: "md",
            alignment: "center",
            safeMargin: 80,
            animation: "pop",
            speakerLabel: "",
        },
        connectedClients: 0,
        controlClients: 0,
        error: "",
        ...partial,
    };
}
