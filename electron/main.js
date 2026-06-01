const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// Load a hosted URL if provided (recommended), otherwise load local server.
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0b1220',
    webPreferences: {
      // Keep this off unless you really need Node in the renderer.
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadURL(APP_URL)

  // Open external links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
