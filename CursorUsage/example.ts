import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as crypto from 'crypto'
import initSqlJs from 'sql.js'

async function getCursorStateDbPathForCurrentWorkspace(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null
  }
  const workspaceDir = workspaceFolders[0].uri.fsPath
  try {
    if (!(await fs.pathExists(workspaceDir))) {
      return null
    }
    const stats = await fs.stat(workspaceDir)
    const ctime = (stats as any).birthtimeMs || stats.ctimeMs
    const normalizedPath = os.platform() === 'win32' ? workspaceDir.replace(/^([A-Z]):/, (_match, letter) => (letter as string).toLowerCase() + ':') : workspaceDir
    const hashInput = normalizedPath + Math.floor(ctime).toString()
    const workspaceId = crypto.createHash('md5').update(hashInput, 'utf8').digest('hex')
    let baseStoragePath: string
    const platform = os.platform()
    const homeDir = os.homedir()
    switch (platform) {
      case 'win32':
        {
          const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')
          baseStoragePath = path.join(appData, 'Cursor', 'User', 'workspaceStorage')
        }
        break
      case 'darwin':
        baseStoragePath = path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
        break
      default:
        baseStoragePath = path.join(homeDir, '.config', 'Cursor', 'User', 'workspaceStorage')
        break
    }
    const stateDbPath = path.join(baseStoragePath, workspaceId, 'state.vscdb')
    if (await fs.pathExists(stateDbPath)) {
      return stateDbPath
    } else {
      return null
    }
  } catch {
    return null
  }
}

async function queryComposerData(stateDbPath: string): Promise<string | null> {
  const wasmPath = (require as any).resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const fileBuffer = await fs.readFile(stateDbPath)
  const db = new SQL.Database(fileBuffer)
  const res = db.exec("SELECT value FROM ItemTable WHERE key = 'composer.composerData';")
  if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
    const val = res[0].values[0][0]
    return typeof val === 'string' ? val : JSON.stringify(val)
  }
  return null
}

let interval: NodeJS.Timeout | undefined

type ComposerEntry = { composerId: string; lastUpdatedAt: number }
let composerState: Map<string, number> = new Map()

function detectComposerChanges(prev: Map<string, number>, next: ComposerEntry[]) {
  const added: ComposerEntry[] = []
  const updated: { composerId: string; from: number; to: number }[] = []
  for (const c of next) {
    const prevVal = prev.get(c.composerId)
    if (prevVal === undefined) {
      added.push(c)
    } else if (prevVal !== c.lastUpdatedAt) {
      updated.push({ composerId: c.composerId, from: prevVal, to: c.lastUpdatedAt })
    }
  }
  const changed = added.length > 0 || updated.length > 0
  return { changed, added, updated }
}

export async function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel('VibeCodingUsage')
  context.subscriptions.push(channel)
  const tick = async () => {
    try {
      const dbPath = await getCursorStateDbPathForCurrentWorkspace()
      if (!dbPath) {
        
        return
      }
      const value = await queryComposerData(dbPath)
      if (!value) {
        return
      }
      let parsed: any
      try {
        parsed = JSON.parse(value)
      } catch {
        return
      }
      const list: ComposerEntry[] = Array.isArray(parsed?.allComposers)
        ? parsed.allComposers
            .map((x: any) => ({ composerId: String(x?.composerId), lastUpdatedAt: Number(x?.lastUpdatedAt) }))
            .filter((x: ComposerEntry) => !!x.composerId && !Number.isNaN(x.lastUpdatedAt))
        : []
      const { changed, added, updated } = detectComposerChanges(composerState, list)
      if (changed) {
        if (added.length > 0) {
          channel.appendLine(`[CursorDB] 新增: ${added.map(a => `${a.composerId}@${a.lastUpdatedAt}`).join(', ')}`)
        }
        if (updated.length > 0) {
          channel.appendLine(`[CursorDB] 更新: ${updated.map(u => `${u.composerId}:${u.from}->${u.to}`).join(', ')}`)
        }
        composerState = new Map(list.map(c => [c.composerId, c.lastUpdatedAt]))
      }
    } catch (e: any) {
      channel.appendLine(`[CursorDB] 查询失败: ${e?.message ?? e}`)
    }
  }
  await tick()
  interval = setInterval(tick, 5000)
}

export function deactivate() {
  if (interval) clearInterval(interval)
}
