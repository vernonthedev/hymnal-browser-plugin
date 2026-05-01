import { Style, DEFAULT_STYLE, createStyle } from "../src/types/style";

describe("Style Utilities", () => {
    describe("DEFAULT_STYLE", () => {
        it("should have correct default values", () => {
            expect(DEFAULT_STYLE.fontSizePreset).toBe("md");
            expect(DEFAULT_STYLE.alignment).toBe("center");
            expect(DEFAULT_STYLE.safeMargin).toBe(80);
            expect(DEFAULT_STYLE.animation).toBe("pop");
            expect(DEFAULT_STYLE.speakerLabel).toBe("");
        });
    });

    describe("createStyle", () => {
        it("should create style with defaults", () => {
            const style = createStyle();
            expect(style).toEqual(DEFAULT_STYLE);
        });

        it("should create style with partial overrides", () => {
            const style = createStyle({ fontSizePreset: "xl" });
            expect(style.fontSizePreset).toBe("xl");
            expect(style.alignment).toBe("center");
        });

        it("should merge multiple overrides", () => {
            const style = createStyle({
                fontSizePreset: "lg",
                alignment: "left",
                speakerLabel: "Test Speaker",
            });
            expect(style.fontSizePreset).toBe("lg");
            expect(style.alignment).toBe("left");
            expect(style.speakerLabel).toBe("Test Speaker");
            expect(style.animation).toBe("pop");
        });
    });

    describe("Style type validation", () => {
        it("should accept valid style object", () => {
            const style: Style = {
                fontSizePreset: "md",
                alignment: "center",
                safeMargin: 80,
                animation: "fade",
                speakerLabel: "Leader",
            };
            expect(style.fontSizePreset).toBe("md");
            expect(style.animation).toBe("fade");
        });

        it("should allow empty speaker label", () => {
            const style: Style = {
                fontSizePreset: "sm",
                alignment: "right",
                safeMargin: 50,
                animation: "none",
                speakerLabel: "",
            };
            expect(style.speakerLabel).toBe("");
        });
    });

    describe("Style validation for real-time updates", () => {
        it("should validate font size presets", () => {
            const validPresets = ["xs", "sm", "md", "lg", "xl", "xxl"];
            validPresets.forEach((preset) => {
                const style = createStyle({ fontSizePreset: preset });
                expect(style.fontSizePreset).toBe(preset);
            });
        });

        it("should validate alignment values", () => {
            const validAlignments = ["left", "center", "right"];
            validAlignments.forEach((alignment) => {
                const style = createStyle({ alignment });
                expect(style.alignment).toBe(alignment);
            });
        });

        it("should validate animation values", () => {
            const validAnimations = ["pop", "fade", "slide", "none"];
            validAnimations.forEach((animation) => {
                const style = createStyle({ animation });
                expect(style.animation).toBe(animation);
            });
        });
    });
});
