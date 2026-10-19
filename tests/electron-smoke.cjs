// Runs our built app in its own disposable data directory. No desktop input,
// UI scripting, user library access, or production-only test hooks are used.
const { app, BrowserWindow, ipcMain, globalShortcut, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, '.test-data', `electron-smoke-${randomUUID()}`);
const reportPath = path.join(root, '.test-data', 'electron-smoke-result.json');
fs.mkdirSync(dataPath, { recursive: true });
fs.writeFileSync(path.join(dataPath, 'preferences.json'), JSON.stringify({ dark: false, opacity: 70 }));
process.env.COMMAND_NOTE_DATA_DIR = dataPath;
let finished = false;
let checking = false;
const finish = report => {
  if (finished) return;
  finished = true;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  globalShortcut.unregisterAll();
  app.exit(report.ok ? 0 : 1);
};
const originalHandle = ipcMain.handle.bind(ipcMain);
const handlers = new Map();
ipcMain.handle = (channel, listener) => { handlers.set(channel, listener); return originalHandle(channel, async (...args) => {
  const result = await listener(...args);
  if (channel === 'library:load' && !finished && !checking) {
    checking = true;
    setTimeout(async () => {
      try {
        const desktop = await handlers.get('shortcut:get')(...args);
        const nativeWindow = BrowserWindow.fromWebContents(args[0].sender);
        const nativeMenuHidden = !!nativeWindow && !nativeWindow.isMenuBarVisible() && Menu.getApplicationMenu() === null;
        const opacityRestored = !!nativeWindow && Math.abs(nativeWindow.getOpacity() - .7) < .005;
        const changed = await handlers.get('preferences:appearance')(args[0], { dark: true, opacity: 40 });
        const opacityApplied = changed.ok && Math.abs(nativeWindow.getOpacity() - .4) < .005;
        const saved = JSON.parse(fs.readFileSync(path.join(dataPath, 'preferences.json'), 'utf8'));
        const opacityPersisted = saved.opacity === 40 && saved.dark === true;
        const invalid = await handlers.get('preferences:appearance')(args[0], { dark: true, opacity: 0 });
        const invalidOpacityRejected = !invalid.ok && invalid.code === 'VALIDATION_ERROR' && Math.abs(nativeWindow.getOpacity() - .4) < .005;
        const reset = await handlers.get('preferences:appearance')(args[0], { dark: false, opacity: 100 });
        const opacityReset = reset.ok && nativeWindow.getOpacity() === 1;
        const ok = result.ok && desktop.ok && desktop.value.trayAvailable && nativeMenuHidden && opacityRestored && opacityApplied && opacityPersisted && invalidOpacityRejected && opacityReset && result.value.records.length === 9 && result.value.records.every(record => record.note.schemaVersion === 2) && result.value.dataPath === path.join(dataPath, 'vault');
        finish({ ok, rendererLoaded: !!result.ok, nativeMenuHidden, opacityRestored, opacityApplied, opacityPersisted, invalidOpacityRejected, opacityReset, noteCount: result.ok ? result.value.records.length : 0, schemaVersion: 2, trayCreated: desktop.ok && desktop.value.trayAvailable, shortcutRegistered: globalShortcut.isRegistered('Ctrl+Alt+K'), dataIsolated: result.ok && result.value.dataPath === path.join(dataPath, 'vault'), error: result.ok ? undefined : result.message });
      } catch (error) { finish({ ok: false, error: String(error) }); }
    }, 750);
  }
  return result;
}); };
setTimeout(() => finish({ ok: false, error: 'Renderer did not call the restricted library IPC within 20 seconds.' }), 20_000);
import(pathToFileURL(path.join(root, 'out', 'main', 'index.js')).href).catch(error => finish({ ok: false, error: String(error) }));
