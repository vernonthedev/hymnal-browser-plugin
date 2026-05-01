import * as fs from "fs";
import * as path from "path";
import { Hymn, sortHymnPath } from "../../types";

export class HymnIndexService {
    async buildIndex(hymnsDir: string): Promise<Hymn[]> {
        if (!fs.existsSync(hymnsDir)) {
            return [];
        }
        try {
            const files = await fs.promises.readdir(hymnsDir);
            const hymnFiles = files
                .filter((file) => file.endsWith(".txt"))
                .sort((a, b) => {
                    const [aNum] = sortHymnPath(a);
                    const [bNum] = sortHymnPath(b);
                    return aNum - bNum;
                });

            const index = await Promise.all(
                hymnFiles.map(async (file): Promise<Hymn> => {
                    const number = file.replace(/\.txt$/, "");
                    let preview = "";
                    try {
                        const content = await fs.promises.readFile(
                            path.join(hymnsDir, file),
                            "utf-8"
                        );
                        const firstLine = content.split(/\r?\n/)[0]?.trim();
                        if (firstLine) preview = firstLine;
                    } catch {
                        // Ignore errors
                    }
                    return { number, preview };
                })
            );
            return index;
        } catch {
            return [];
        }
    }

    async readLines(hymn: string, hymnsDir: string): Promise<string[]> {
        const filePath = path.join(hymnsDir, `${hymn}.txt`);
        try {
            if (!fs.existsSync(filePath)) return [];
            const content = await fs.promises.readFile(filePath, "utf-8");
            return content
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        } catch {
            return [];
        }
    }
}
