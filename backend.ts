import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { WebSocket, WebSocketServer } from 'ws'
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createServer } from 'http'

const HOST = "127.0.0.1"
const APP_VERSION = "2.0.0"
const HEARTBEAT_INTERVAL_SECONDS = 10
const HEARTBEAT_TIMEOUT_SECONDS = 30
const DEFAULT_STYLE = {
  fontSizePreset: "md",
  alignment: "center",
  safeMargin: 80,
  animation: "pop",
  speakerLabel: "",
}
const DEFAULT_PRESETS = {
  "Default": { ...DEFAULT_STYLE },
  "Stage": {
    fontSizePreset: "xl",
    alignment: "center",
    safeMargin: 120,
    animation: "fade",
    speakerLabel: "",
  },
}
const OVERLAYS = [
  { id: "lowerthird", name: "Lower Third", path: "/overlays/lowerthird.html" },
  { id: "stage", name: "Stage", path: "/overlays/stage.html" },
  { id: "lyrics", name: "Lyrics", path: "/overlays/lyrics.html" },
]

interface AppState {
  baseDir: string
  dataDir: string
  hymnsDir: string
  presetsPath: string
  token?: string
  httpPort: number
  wsPort: number
  connectedClients: number
  controlClients: number
  lastError: string
  overlayClients: Map<number, OverlayClient>
  controlClientIds: Set<number>
  presets: Record<string, any>
  hymnIndex: HymnItem[]
  currentHymn: string
  lines: string[]
  lineIndex: number
  visible: boolean
  style: any
}

interface OverlayClient {
  lastPong: number
  authorized: boolean
  role: 'overlay'
}

interface HymnItem {
  number: string
  preview: string
}

class HymnBroadcastServer {
  private app: Elysia
  private state: AppState
  private wss: WebSocket.Server | null = null
  private httpServer: ReturnType<typeof createServer> | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(baseDir: string, dataDir: string, token?: string) {
    this.state = this.initializeState(baseDir, dataDir, token)
    this.app = this.createApp()
  }

  private initializeState(baseDir: string, dataDir: string, token?: string): AppState {
    const hymnsDir = existsSync(join(dataDir, 'hymns'))
      ? join(dataDir, 'hymns')
      : join(baseDir, 'hymns')

    const presetsPath = join(dataDir, 'style-presets.json')

    // Ensure data directory exists
    mkdirSync(dataDir, { recursive: true })

    const state: AppState = {
      baseDir,
      dataDir,
      hymnsDir,
      presetsPath,
      token,
      httpPort: 0,
      wsPort: 0,
      connectedClients: 0,
      controlClients: 0,
      lastError: '',
      overlayClients: new Map(),
      controlClientIds: new Set(),
      presets: this.loadPresets(presetsPath),
      hymnIndex: this.buildHymnIndex(hymnsDir),
      currentHymn: "1",
      lines: this.readHymnLines("1", hymnsDir),
      lineIndex: 0,
      visible: true,
      style: { ...DEFAULT_STYLE }
    }

    return state
  }

  private loadPresets(presetsPath: string): Record<string, any> {
    if (!existsSync(presetsPath)) {
      const presets = { ...DEFAULT_PRESETS }
      this.savePresets(presetsPath, presets)
      return presets
    }

    try {
      const data = JSON.parse(readFileSync(presetsPath, 'utf-8'))
      if (typeof data === 'object' && data !== null) {
        return data
      }
    } catch {}

    const presets = { ...DEFAULT_PRESETS }
    this.savePresets(presetsPath, presets)
    return presets
  }

  private savePresets(presetsPath: string, presets: Record<string, any>): void {
    writeFileSync(presetsPath, JSON.stringify(presets, null, 2))
  }

  private readHymnLines(hymn: string, hymnsDir: string): string[] {
    const path = join(hymnsDir, `${hymn}.txt`)
    if (!existsSync(path)) return []

    const content = readFileSync(path, 'utf-8')
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
  }

  private sortHymnPath(path: string): [number, string] {
    const stem = path.replace(/\.txt$/, '')
    const num = parseInt(stem)
    return isNaN(num) ? [Number.MAX_SAFE_INTEGER, stem] : [num, stem]
  }

  private buildHymnIndex(hymnsDir: string): HymnItem[] {
    if (!existsSync(hymnsDir)) return []

    const hymnFiles = readdirSync(hymnsDir)
      .filter(file => file.endsWith('.txt'))
      .sort((a, b) => {
        const [aNum] = this.sortHymnPath(a)
        const [bNum] = this.sortHymnPath(b)
        return aNum - bNum
      })

    return hymnFiles.map(file => {
      const number = file.replace(/\.txt$/, '')
      let preview = ''
      try {
        const content = readFileSync(join(hymnsDir, file), 'utf-8')
        const firstLine = content.split(/\r?\n/)[0]?.trim()
        if (firstLine) preview = firstLine
      } catch {}

      return { number, preview }
    })
  }

  private createApp(): Elysia {
    return new Elysia()
      .use(cors())
      .use(staticPlugin({
        assets: resolve(this.state.baseDir),
        prefix: ''
      }))
      .get('/health', () => ({
        ok: existsSync(this.state.hymnsDir),
        http_port: this.state.httpPort,
        ws_port: this.state.wsPort,
      }))
      .get('/status', () => this.getStatusPayload())
      .get('/version', () => ({ version: APP_VERSION }))
      .get('/hymns', () => ({ items: this.state.hymnIndex }))
      .get('/presets', () => ({ items: this.state.presets }))
  }

  private getStatusPayload() {
    return {
      version: APP_VERSION,
      http_port: this.state.httpPort,
      ws_port: this.state.wsPort,
      current_hymn: this.state.currentHymn,
      line_index: this.state.lineIndex,
      total_lines: this.state.lines.length,
      text: this.currentText(),
      previous_text: this.state.lineIndex > 0 ? this.state.lines[this.state.lineIndex - 1] : '',
      next_text: this.state.lineIndex + 1 < this.state.lines.length ? this.state.lines[this.state.lineIndex + 1] : '',
      visible: this.state.visible,
      connected_clients: this.state.connectedClients,
      control_clients: this.state.controlClients,
      style: this.state.style,
      presets: this.state.presets,
      overlay_profiles: OVERLAYS,
      last_error: this.state.lastError,
      token_enabled: !!this.state.token,
    }
  }

  private currentText(): string {
    if (!this.state.lines || this.state.lineIndex >= this.state.lines.length) {
      return ''
    }
    return this.state.lines[this.state.lineIndex]
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    // Mark as overlay client initially
    const clientId = Math.random() * 1000000 | 0
    this.state.overlayClients.set(clientId, {
      lastPong: Date.now() / 1000,
      authorized: !this.state.token,
      role: 'overlay'
    })

    ;(ws as any).clientId = clientId

    // Send hello message
    ws.send(JSON.stringify({
      type: 'hello',
      requiresAuth: !!this.state.token,
      overlayProfiles: OVERLAYS,
      httpPort: this.state.httpPort,
      wsPort: this.state.wsPort,
    }))

    if (!this.state.token) {
      ws.send(JSON.stringify(this.overlayPayload('state')))
    }

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = data.toString()
        this.handleWebSocketMessage(ws, message)
      } catch (error) {
        console.error('WebSocket message error:', error)
      }
    })

    // Handle close
    ws.on('close', () => {
      this.handleWebSocketClose(ws)
    })
  }

  private handleWebSocketMessage(ws: WebSocket, message: string): void {
    try {
      const data = JSON.parse(message)
      const clientId = (ws as any).clientId

      if (data.cmd === 'hello') {
        this.handleHello(ws, data, clientId)
      } else if (data.cmd === 'auth') {
        this.handleAuth(ws, data, clientId)
      } else if (data.cmd === 'pong') {
        this.handlePong(clientId)
      } else {
        this.handleCommand(ws, data, clientId)
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  }

  private handleHello(ws: any, data: any, clientId: number): void {
    const role = data.role || 'overlay'
    if (role === 'control') {
      this.markClientRole(clientId, 'control')
      ws.send(JSON.stringify({ type: 'status', status: this.getStatusPayload() }))
    } else {
      this.markClientRole(clientId, 'overlay')
      ws.send(JSON.stringify(this.overlayPayload('state')))
    }
  }

  private handleAuth(ws: any, data: any, clientId: number): void {
    const overlayMeta = this.state.overlayClients.get(clientId)
    if (!overlayMeta) {
      this.markClientRole(clientId, 'overlay')
      return
    }

    const token = data.token || ''
    overlayMeta.authorized = token === this.state.token || !this.state.token

    if (!overlayMeta.authorized) {
      ws.send(JSON.stringify({ type: 'error', message: 'Overlay token rejected.' }))
      return
    }

    ws.send(JSON.stringify(this.overlayPayload('state')))
  }

  private handlePong(clientId: number): void {
    const overlayMeta = this.state.overlayClients.get(clientId)
    if (overlayMeta) {
      overlayMeta.lastPong = Date.now() / 1000
    }
  }

  private handleCommand(ws: any, data: any, clientId: number): void {
    // Check authorization for overlay clients
    if (this.state.overlayClients.has(clientId)) {
      const overlayMeta = this.state.overlayClients.get(clientId)!
      if (this.state.token && !overlayMeta.authorized) {
        ws.send(JSON.stringify({ type: 'error', message: 'Overlay is not authorized.' }))
        return
      }
    }

    const { success, error, payload } = this.processCommand(data)

    if (!success) {
      ws.send(JSON.stringify({ type: 'error', message: error }))
      ws.send(JSON.stringify({ type: 'status', status: this.getStatusPayload() }))
      return
    }

    if (payload) {
      this.broadcast(payload)
      if (payload.type === 'hymn_index' || payload.type === 'presets') {
        ws.send(JSON.stringify(payload))
      }
    }
  }

  private handleWebSocketClose(ws: WebSocket): void {
    const clientId = (ws as any).clientId
    if (!clientId) return

    if (this.state.overlayClients.has(clientId)) {
      this.state.overlayClients.delete(clientId)
    }
    if (this.state.controlClientIds.has(clientId)) {
      this.state.controlClientIds.delete(clientId)
    }

    this.updateClientCounts()
    this.broadcast(this.overlayPayload('status'))
  }

  private markClientRole(clientId: number, role: string): void {
    this.state.overlayClients.delete(clientId)
    this.state.controlClientIds.delete(clientId)

    if (role === 'control') {
      this.state.controlClientIds.add(clientId)
    } else {
      this.state.overlayClients.set(clientId, {
        lastPong: Date.now() / 1000,
        authorized: !this.state.token,
        role: 'overlay'
      })
    }

    this.updateClientCounts()
  }

  private updateClientCounts(): void {
    this.state.connectedClients = this.state.overlayClients.size
    this.state.controlClients = this.state.controlClientIds.size
  }

  private processCommand(command: any): { success: boolean, error?: string, payload?: any } {
    const cmd = command.cmd
    if (!cmd) {
      return { success: false, error: 'Missing cmd' }
    }

    switch (cmd) {
      case 'load':
        return this.handleLoadCommand(command)
      case 'next':
        return this.handleNextCommand()
      case 'prev':
        return this.handlePrevCommand()
      case 'reset':
        return this.handleResetCommand()
      case 'blank':
        return this.handleBlankCommand()
      case 'show':
        return this.handleShowCommand()
      case 'retrigger':
      case 'ping_overlay':
        return this.handleRetriggerCommand()
      case 'update_style':
        return this.handleUpdateStyleCommand(command)
      case 'save_preset':
        return this.handleSavePresetCommand(command)
      case 'apply_preset':
        return this.handleApplyPresetCommand(command)
      case 'reload_hymns':
        return this.handleReloadHymnsCommand()
      default:
        this.state.lastError = `Unsupported command: ${cmd}`
        return { success: false, error: this.state.lastError }
    }
  }

  private handleLoadCommand(command: any): { success: boolean, error?: string, payload?: any } {
    const hymn = String(command.hymn || '').trim()
    if (!hymn) {
      this.state.lastError = 'Please enter a hymn number.'
      return { success: false, error: this.state.lastError }
    }

    const lines = this.readHymnLines(hymn, this.state.hymnsDir)
    if (!lines.length) {
      this.state.lastError = `Hymn ${hymn} was not found or is empty.`
      return { success: false, error: this.state.lastError }
    }

    this.state.currentHymn = hymn
    this.state.lines = lines
    this.state.lineIndex = 0
    this.state.visible = true
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('state') }
  }

  private handleNextCommand(): { success: boolean, error?: string, payload?: any } {
    if (this.state.lineIndex < this.state.lines.length - 1) {
      this.state.lineIndex++
    }
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('state') }
  }

  private handlePrevCommand(): { success: boolean, error?: string, payload?: any } {
    if (this.state.lineIndex > 0) {
      this.state.lineIndex--
    }
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('state') }
  }

  private handleResetCommand(): { success: boolean, error?: string, payload?: any } {
    this.state.lineIndex = 0
    this.state.visible = true
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('state') }
  }

  private handleBlankCommand(): { success: boolean, error?: string, payload?: any } {
    this.state.visible = false
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('visibility') }
  }

  private handleShowCommand(): { success: boolean, error?: string, payload?: any } {
    this.state.visible = true
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('visibility') }
  }

  private handleRetriggerCommand(): { success: boolean, error?: string, payload?: any } {
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('retrigger') }
  }

  private handleUpdateStyleCommand(command: any): { success: boolean, error?: string, payload?: any } {
    const style = command.style
    if (typeof style !== 'object' || !style) {
      this.state.lastError = 'Style payload must be an object.'
      return { success: false, error: this.state.lastError }
    }

    this.state.style = { ...this.state.style, ...style }
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('style') }
  }

  private handleSavePresetCommand(command: any): { success: boolean, error?: string, payload?: any } {
    const name = String(command.name || '').trim()
    if (!name) {
      this.state.lastError = 'Preset name is required.'
      return { success: false, error: this.state.lastError }
    }

    this.state.presets[name] = { ...this.state.style }
    this.savePresets(this.state.presetsPath, this.state.presets)
    this.state.lastError = ''
    return { success: true, payload: { type: 'presets', presets: this.state.presets } }
  }

  private handleApplyPresetCommand(command: any): { success: boolean, error?: string, payload?: any } {
    const name = String(command.name || '').trim()
    const preset = this.state.presets[name]
    if (!preset) {
      this.state.lastError = `Preset ${name} was not found.`
      return { success: false, error: this.state.lastError }
    }

    this.state.style = { ...preset }
    this.state.lastError = ''
    return { success: true, payload: this.overlayPayload('style') }
  }

  private handleReloadHymnsCommand(): { success: boolean, error?: string, payload?: any } {
    this.state.hymnIndex = this.buildHymnIndex(this.state.hymnsDir)
    this.state.lastError = ''
    return { success: true, payload: { type: 'hymn_index', items: this.state.hymnIndex } }
  }

  private overlayPayload(event: string = 'state') {
    return {
      type: event,
      httpPort: this.state.httpPort,
      wsPort: this.state.wsPort,
      hymn: this.state.currentHymn,
      lineIndex: this.state.lineIndex,
      totalLines: this.state.lines.length,
      text: this.currentText(),
      visible: this.state.visible,
      style: this.state.style,
      connectedClients: this.state.connectedClients,
      controlClients: this.state.controlClients,
      error: this.state.lastError,
    }
  }

  private broadcast(payload: any): void {
    if (!this.wss) return

    const message = JSON.stringify(payload)
    const targets = payload.type === 'state' || payload.type === 'visibility' || payload.type === 'retrigger' || payload.type === 'style'
      ? Array.from(this.wss.clients).filter(ws => {
          const clientId = (ws as any).clientId
          if (!clientId || !this.state.overlayClients.has(clientId)) return false

          const overlayMeta = this.state.overlayClients.get(clientId)!
          return !this.state.token || overlayMeta.authorized
        })
      : Array.from(this.wss.clients)

    targets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    })
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now() / 1000

      Array.from(this.wss!.clients).forEach(ws => {
        const clientId = (ws as any).clientId
        const overlayMeta = this.state.overlayClients.get(clientId)
        if (!overlayMeta) return

        if (now - overlayMeta.lastPong > HEARTBEAT_TIMEOUT_SECONDS) {
          ws.terminate()
          return
        }

        if (this.state.token && !overlayMeta.authorized) return

        ws.send(JSON.stringify({ type: 'heartbeat', ts: Math.floor(now) }))
      })
    }, HEARTBEAT_INTERVAL_SECONDS * 1000)
  }

  private emitReady(): void {
    const payload = {
      event: 'ready',
      version: APP_VERSION,
      http_port: this.state.httpPort,
      ws_port: this.state.wsPort,
      data_dir: this.state.dataDir,
      hymns_dir: this.state.hymnsDir,
      overlay_profiles: OVERLAYS,
    }
    console.log(JSON.stringify(payload))
  }

  async start(httpPort: number, wsPort: number): Promise<void> {
    this.state.httpPort = httpPort
    this.state.wsPort = wsPort

    // Create HTTP server
    this.httpServer = createServer(this.app.fetch)

    // Create WebSocket server on the same port
    this.wss = new WebSocketServer({
      server: this.httpServer,
      perMessageDeflate: false
    })

    // Handle WebSocket connections
    this.wss.on('connection', (ws, req) => {
      this.handleWebSocketConnection(ws)
    })

    return new Promise((resolve) => {
      this.httpServer!.listen(httpPort, HOST, () => {
        this.startHeartbeat()
        this.emitReady()
        resolve()
      })
    })
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    if (this.wss) {
      this.wss.close()
    }
    if (this.httpServer) {
      this.httpServer.close()
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  let httpPort = 9999
  let wsPort = 8765
  let baseDir = resolve(__dirname)
  let dataDir = baseDir
  let token = ''

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--http-port':
        httpPort = parseInt(args[++i])
        break
      case '--ws-port':
        wsPort = parseInt(args[++i])
        break
      case '--base-dir':
        baseDir = args[++i]
        break
      case '--data-dir':
        dataDir = args[++i]
        break
      case '--token':
        token = args[++i]
        break
    }
  }

  const server = new HymnBroadcastServer(baseDir, dataDir, token || undefined)

  try {
    await server.start(httpPort, wsPort)
    // Keep server running
    process.on('SIGINT', () => {
      server.stop()
      process.exit(0)
    })
    process.on('SIGTERM', () => {
      server.stop()
      process.exit(0)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}

export { HymnBroadcastServer }