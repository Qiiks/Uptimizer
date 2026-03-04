import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// app.getAppPath() reliably returns the app root in both dev and packaged contexts.
// __dirname-relative paths break in packaged .exe because __dirname resolves inside
// the asar bundle (resources/app.asar/dist-electron/), not the app root.
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(__dirname)
// RENDERER_DIST: resolved lazily after app is ready so app.getAppPath() is available
let RENDERER_DIST: string

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : path.join(app.getAppPath(), 'dist')

let win: BrowserWindow | null

const writeLog = (message: string) => {
  try {
    const logDir = app.getPath('userData')
    const logPath = path.join(logDir, 'main.log')
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`)
  } catch (error) {
    console.error('[main] Failed to write log', error)
  }
}

function createWindow() {
  // Resolve renderer dist using app.getAppPath() — works in both dev and packaged .exe
  RENDERER_DIST = path.join(app.getAppPath(), 'dist')
  writeLog(`[main] APP_ROOT=${process.env.APP_ROOT}`)
  writeLog(`[main] RENDERER_DIST=${RENDERER_DIST}`)
  writeLog(`[main] PRELOAD=${path.join(__dirname, 'preload.mjs')}`)

  try {
    win = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 800,
      minHeight: 600,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#020617', // slate-950
        symbolColor: '#cbd5e1', // slate-300
      },
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.mjs'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
  } catch (error) {
    writeLog(`[main] BrowserWindow creation failed: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }

  // Test active push message to Renderer-process.
  win.on('ready-to-show', () => {
    writeLog('[main] ready-to-show')
    win?.show()
    win?.focus()
  })

  win.on('show', () => {
    writeLog('[main] window shown')
  })

  win.on('hide', () => {
    writeLog('[main] window hidden')
  })

  win.on('close', () => {
    writeLog('[main] window close')
  })

  win.on('closed', () => {
    writeLog('[main] window closed')
  })

  win.on('unresponsive', () => {
    writeLog('[main] window unresponsive')
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`[main] render-process-gone: ${details.reason}`)
  })

  win.webContents.on('did-finish-load', () => {
    writeLog('[main] did-finish-load')
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    setTimeout(() => {
      writeLog(`[main] window visible=${win?.isVisible()} focused=${win?.isFocused()}`)
    }, 500)
  })

  // Log any page load failures to help debug white screen issues
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`[main] did-fail-load: ${errorCode} ${errorDescription} url=${validatedURL}`)
  })

  if (VITE_DEV_SERVER_URL) {
    writeLog(`[main] Loading dev server URL: ${VITE_DEV_SERVER_URL}`)
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html')
    writeLog(`[main] Loading renderer from: ${indexPath}`)
    win.loadFile(indexPath)
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  try {
    createWindow()
  } catch (error) {
    writeLog(`[main] Failed to create window: ${error instanceof Error ? error.message : String(error)}`)
  }
})

// IPC Handlers
ipcMain.handle('execute-command', async (_, command: string) => {
  return new Promise((resolve) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command error: ${error.message}`)
        resolve({ error: error.message, stdout, stderr })
        return
      }
      resolve({ stdout, stderr })
    })
  })
})

// Geolocate IPs via ip-api.com batch endpoint — up to 100 IPs in a single POST request.
// Free tier allows 45 requests/minute for batch (vastly better than sequential per-IP APIs).
// Docs: https://ip-api.com/docs/api:batch
ipcMain.handle('geolocate-ips', async (_, ips: string[]) => {
  if (!ips || ips.length === 0) { return [] }

  writeLog(`[geolocate-ips] Batch request for ${ips.length} IPs: ${ips.join(', ')}`)

  const failResult = { status: 'fail', lat: 0, lon: 0, city: '', country: '', isp: '', as: '' }

  // ip-api.com batch: POST array of { query } objects, returns array in same order
  const body = JSON.stringify(ips.map(ip => ({ query: ip, fields: 'status,lat,lon,city,country,isp,as,query' })))

  const raw = await new Promise<string>((resolve) => {
    const options = {
      hostname: 'ip-api.com',
      port: 80,
      path: '/batch?fields=status,lat,lon,city,country,isp,as,query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => resolve(data))
    })

    req.setTimeout(15000, () => {
      writeLog('[geolocate-ips] batch request timed out')
      req.destroy(new Error('geolocate-batch timeout'))
      resolve('[]')
    })

    req.on('error', (err: Error) => {
      writeLog(`[geolocate-ips] batch request error: ${err.message}`)
      resolve('[]')
    })

    req.write(body)
    req.end()
  })

  let batchData: Array<{ status: string; lat: number; lon: number; city: string; country: string; isp: string; as: string; query: string }> = []
  try {
    batchData = JSON.parse(raw)
    writeLog(`[geolocate-ips] batch returned ${batchData.length} results`)
  } catch (e) {
    writeLog(`[geolocate-ips] batch JSON parse failed: ${String(e)} — raw: ${raw.substring(0, 300)}`)
  }

  // Build a lookup map by IP so we return results in the same order as the input array
  const lookup = new Map<string, typeof failResult>()
  for (const entry of batchData) {
    if (entry.status === 'success') {
      lookup.set(entry.query, {
        status: 'success',
        lat: entry.lat,
        lon: entry.lon,
        city: entry.city,
        country: entry.country,
        isp: entry.isp,
        as: entry.as,
      })
      writeLog(`[geolocate-ips] success for ${entry.query}: ${entry.city}, ${entry.country}`)
    } else {
      writeLog(`[geolocate-ips] fail for ${entry.query}: status=${entry.status}`)
    }
  }

  return ips.map(ip => lookup.get(ip) ?? failResult)
})
