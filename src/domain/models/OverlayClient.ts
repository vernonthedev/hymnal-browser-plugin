export type ClientRole = "overlay" | "control";

export interface OverlayClient {
    clientId: number;
    role: ClientRole;
    authorized: boolean;
    lastPong: number;
}

export function createOverlayClient(
    clientId: number,
    token: string
): OverlayClient {
    return {
        clientId,
        role: "overlay",
        authorized: !token,
        lastPong: Date.now() / 1000,
    };
}
