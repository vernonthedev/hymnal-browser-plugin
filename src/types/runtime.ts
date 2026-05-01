import { Style } from "./style";
import { OverlayProfile, OverlayUrl } from "./overlay";

export interface RuntimeInfo {
    version: string;
    httpPort: number;
    wsPort: number;
    dataDir: string;
    hymnsDir: string;
    token: string;
    overlayProfiles: OverlayProfile[];
    overlayUrls: OverlayUrl[];
}

export interface ServerConfig {
    baseDir: string;
    dataDir: string;
    hymnsDir: string;
    presetsPath: string;
    token: string;
    httpPort: number;
    wsPort: number;
}
