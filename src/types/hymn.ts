export interface Hymn {
    number: string;
    preview: string;
}

export function sortHymnPath(filePath: string): [number, string] {
    const stem = filePath.replace(/\.txt$/, "");
    const num = parseInt(stem, 10);
    return isNaN(num) ? [Number.MAX_SAFE_INTEGER, stem] : [num, stem];
}
