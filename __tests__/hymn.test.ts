import { sortHymnPath, Hymn } from "../src/types/hymn";

describe("Hymn Utilities", () => {
    describe("sortHymnPath", () => {
        it("should parse numeric hymn numbers correctly", () => {
            const [num, str] = sortHymnPath("1.txt");
            expect(num).toBe(1);
            expect(str).toBe("1");
        });

        it("should parse multi-digit hymn numbers correctly", () => {
            const [num, str] = sortHymnPath("123.txt");
            expect(num).toBe(123);
            expect(str).toBe("123");
        });

        it("should handle non-numeric paths with MAX_SAFE_INTEGER", () => {
            const [num, str] = sortHymnPath("abc.txt");
            expect(num).toBe(Number.MAX_SAFE_INTEGER);
            expect(str).toBe("abc");
        });

        it("should handle paths without .txt extension", () => {
            const [num, str] = sortHymnPath("42");
            expect(num).toBe(42);
            expect(str).toBe("42");
        });

        it("should handle hymn numbers with leading zeros", () => {
            const [num, str] = sortHymnPath("007.txt");
            expect(num).toBe(7);
            expect(str).toBe("007");
        });

        it("should correctly sort multiple hymns", () => {
            const hymns = ["10.txt", "2.txt", "1.txt", "abc.txt"];
            const sorted = [...hymns].sort((a, b) => {
                const [aNum] = sortHymnPath(a);
                const [bNum] = sortHymnPath(b);
                return aNum - bNum;
            });
            expect(sorted).toEqual(["1.txt", "2.txt", "10.txt", "abc.txt"]);
        });
    });

    describe("Hymn type", () => {
        it("should accept valid hymn object", () => {
            const hymn: Hymn = { number: "1", preview: "Amazing Grace" };
            expect(hymn.number).toBe("1");
            expect(hymn.preview).toBe("Amazing Grace");
        });

        it("should allow empty preview", () => {
            const hymn: Hymn = { number: "1", preview: "" };
            expect(hymn.preview).toBe("");
        });
    });
});
