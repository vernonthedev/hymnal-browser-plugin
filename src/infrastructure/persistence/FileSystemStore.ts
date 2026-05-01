import * as fs from "fs";
import * as path from "path";
import { Hymn } from "../../domain";
import { HymnIndexService } from "../../domain/services/HymnIndex";
import { StyleManagerService } from "../../domain/services/StyleManager";

export class FileSystemStore {
    private hymnIndexService = new HymnIndexService();
    private styleManagerService = new StyleManagerService();

    async ensureDirectory(dirPath: string): Promise<void> {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    async buildHymnIndex(hymnsDir: string): Promise<Hymn[]> {
        return this.hymnIndexService.buildIndex(hymnsDir);
    }

    async readHymnLines(hymn: string, hymnsDir: string): Promise<string[]> {
        return this.hymnIndexService.readLines(hymn, hymnsDir);
    }

    async loadPresets(presetsPath: string): Promise<Record<string, unknown>> {
        return this.styleManagerService.loadPresets(presetsPath);
    }

    async savePresets(
        presetsPath: string,
        presets: Record<string, unknown>
    ): Promise<void> {
        return this.styleManagerService.savePresets(
            presetsPath,
            presets as Record<string, any>
        );
    }

    async seedHymns(sourceDir: string, targetDir: string): Promise<void> {
        if (!fs.existsSync(sourceDir)) return;

        const targetFiles = await fs.promises.readdir(targetDir);
        const hasFiles = targetFiles.some((entry) => entry.endsWith(".txt"));
        if (hasFiles) return;

        const sourceFiles = await fs.promises.readdir(sourceDir);
        for (const fileName of sourceFiles) {
            if (!fileName.endsWith(".txt")) continue;
            await fs.promises.copyFile(
                path.join(sourceDir, fileName),
                path.join(targetDir, fileName)
            );
        }
    }
}
