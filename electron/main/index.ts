import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell, Tray } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { appearanceSchema, defaultAppearance, LibraryError, windowLayoutSchema, type Result, type WindowLayoutInput } from '../../shared/library';
import { channels } from '../../shared/channels';
import { clampWindowBounds, expandedWindowSize, WindowLayouts } from '../../shared/window-layout';
import { NoteStore } from './note-store';
import Transfers from './transfers';
import ShortcutController, { type ShortcutAction, type ShortcutPreferences } from './shortcuts';
import toggleWindowVisibility from './window-visibility';

const directory = path.dirname(fileURLToPath(import.meta.url));
const development = !app.isPackaged;
app.setName(development ? 'CommandNote-dev' : 'CommandNote');
if (development && process.env.COMMAND_NOTE_DATA_DIR) app.setPath('userData', path.resolve(process.env.COMMAND_NOTE_DATA_DIR));
protocol.registerSchemesAsPrivileged([{ scheme: 'command-note', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window: BrowserWindow | null = null;
let store: NoteStore;
let transfers: Transfers;
let tray: Tray | null = null;
let quitting = false;
let shortcuts: ShortcutController;
let windowLayouts: WindowLayouts;
let expandedMaximized = false;
const devUrl = development ? process.env.ELECTRON_RENDERER_URL : undefined;

async function result<T>(action: () => Promise<T> | T): Promise<Result<T>> {
  try { return { ok: true, value: await action() }; }
  catch (error) {
    if (error instanceof LibraryError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? '입력값이나 파일 형식을 확인해 주세요.' };
    return { ok: false, code: 'IO_ERROR', message: '파일 작업을 완료하지 못했습니다. 파일 형식과 저장 위치를 확인해 주세요.' };
  }
}
function showWindow(channel: typeof channels.focusSearch | typeof channels.toggleMode) {
  const target = window;
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show(); target.focus();
  const send = () => { if (!target.isDestroyed()) target.webContents.send(channel); };
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', send);
  else send();
}
const showSearch = () => showWindow(channels.focusSearch);
const toggleSearch = () => toggleWindowVisibility(window, { trayAvailable: !!tray, show: showSearch });
const toggleMode = () => showWindow(channels.toggleMode);
const shortcutState = () => ({ ...shortcuts.state(), trayAvailable: !!tray });
function setWindowLayout(input: WindowLayoutInput): void {
  if (!window || window.isDestroyed()) return;
  const previousMode = windowLayouts.mode;
  if (input.mode === 'expanded' && previousMode === 'expanded' && window.isMaximized()) return;
  const currentBounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  if (input.mode === 'simple' && previousMode === 'expanded') {
    expandedMaximized = window.isMaximized();
    if (expandedMaximized) window.unmaximize();
  }
  const workArea = screen.getDisplayMatching(windowLayouts.referenceBounds(input.mode, currentBounds)).workArea;
  const layout = windowLayouts.update(input, currentBounds, workArea);
  // Lower the expanded minimum before shrinking; otherwise Windows keeps 600px.
  window.setMinimumSize(layout.minimumWidth, layout.minimumHeight);
  window.setResizable(input.mode === 'expanded');
  window.setMaximizable(input.mode === 'expanded');
  const bounds = window.getBounds();
  if (Object.keys(layout.bounds).some(key => layout.bounds[key as keyof typeof bounds] !== bounds[key as keyof typeof bounds])) window.setBounds(layout.bounds);
  if (input.mode === 'expanded' && previousMode === 'simple' && expandedMaximized) window.maximize();
}
async function persistShortcuts(preferences: ShortcutPreferences) {
  const file = path.join(app.getPath('userData'), 'shortcut.json');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(preferences), 'utf8');
    await fs.rename(temporary, file);
  } catch (error) { await fs.rm(temporary, { force: true }).catch(() => undefined); throw error; }
}
async function changeShortcut(value: unknown, action: ShortcutAction) {
  await shortcuts.set(action, value);
  return shortcutState();
}
function registerIpc() {
  const handle = (channel: string, action: (...args: any[]) => unknown) => ipcMain.handle(channel, (event, ...args) => result(async () => {
    const url = event.senderFrame?.url;
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !(devUrl ? url && new URL(url).origin === new URL(devUrl).origin : url?.startsWith('command-note://app/'))) throw new LibraryError('VALIDATION_ERROR', '허용되지 않은 앱 요청입니다.');
    return action(...args);
  }));
  handle(channels.load, async () => { const snapshot = await store.load(); window!.setOpacity(snapshot.appearance.opacity / 100); return snapshot; });
  handle(channels.saveNote, input => store.saveNote(input));
  handle(channels.setLifecycle, input => store.setLifecycle(input));
  handle(channels.setFavorite, (id, favorite) => store.setFavorite(id, favorite));
  handle(channels.touchRecent, id => store.touchRecent(id));
  handle(channels.saveAppearance, async value => { const appearance = await store.saveAppearance(value); window!.setOpacity(appearance.opacity / 100); return appearance; });
  handle(channels.importMarkdown, () => transfers.importMarkdown());
  handle(channels.exportMarkdown, ids => transfers.exportMarkdown(ids));
  handle(channels.exportBackup, () => transfers.exportBackup());
  handle(channels.inspectBackup, () => transfers.inspectBackup());
  handle(channels.restoreBackup, token => transfers.restoreBackup(token));
  handle(channels.getShortcut, shortcutState);
  handle(channels.setShortcut, value => changeShortcut(value, 'show'));
  handle(channels.setModeShortcut, value => changeShortcut(value, 'toggle'));
  handle(channels.openExternal, async input => {
    const url = new URL(z.string().max(4000).parse(input));
    if (!['http:', 'https:'].includes(url.protocol)) throw new LibraryError('VALIDATION_ERROR', 'http와 https 링크만 열 수 있습니다.');
    await shell.openExternal(url.href);
  });
  handle(channels.openDataFolder, async () => { await store.load(); const error = await shell.openPath(store.vaultPath); if (error) throw new Error(error); });
  handle(channels.setAlwaysOnTop, value => { window!.setAlwaysOnTop(z.boolean().parse(value)); return window!.isAlwaysOnTop(); });
  handle(channels.setWindowLayout, value => setWindowLayout(windowLayoutSchema.parse(value)));
  handle(channels.minimize, () => window!.minimize());
  handle(channels.hide, () => { if (tray) window!.hide(); else window!.minimize(); });
  handle(channels.quit, () => { setImmediate(() => app.quit()); });
  handle(channels.copyText, text => clipboard.writeText(z.string().max(1_000_000).parse(text)));
}
function brandIcon(file: 'commandnote.png' | 'tray.png') {
  const bundledPath = path.resolve(directory, '../renderer/brand', file);
  let icon = nativeImage.createFromPath(bundledPath);
  // electron-vite dev serves public assets without building the renderer folder.
  if (icon.isEmpty() && development) icon = nativeImage.createFromPath(path.resolve(directory, '../../public/brand', file));
  if (icon.isEmpty()) throw new Error(`앱 아이콘을 불러오지 못했습니다: ${file}`);
  return icon;
}
function trayIcon() {
  try { return brandIcon('tray.png'); }
  catch { return brandIcon('commandnote.png').resize({ width: 32, height: 32 }); }
}
async function createWindow() {
  Menu.setApplicationMenu(null);
  let appearance = { ...defaultAppearance };
  try { appearance = appearanceSchema.parse(JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'preferences.json'), 'utf8'))); }
  catch { /* Renderer reports unreadable preferences; startup never resets user data. */ }
  const workArea = screen.getPrimaryDisplay().workArea;
  const expandedBounds = clampWindowBounds({ ...expandedWindowSize, x: workArea.x + (workArea.width - expandedWindowSize.width) / 2, y: workArea.y + (workArea.height - expandedWindowSize.height) / 2 }, workArea);
  windowLayouts = new WindowLayouts(expandedBounds);
  const initialLayout = windowLayouts.update({ mode: appearance.mode, resultCount: 0, hasQuery: false }, expandedBounds, workArea);
  window = new BrowserWindow({ ...initialLayout.bounds, minWidth: initialLayout.minimumWidth, minHeight: initialLayout.minimumHeight, resizable: appearance.mode === 'expanded', maximizable: appearance.mode === 'expanded', frame: false, title: '커맨드 노트', backgroundColor: appearance.dark ? '#111318' : '#ffffff', icon: brandIcon('commandnote.png'), show: false,
    webPreferences: { preload: path.join(directory, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.setOpacity(appearance.opacity / 100);
  window.on('will-move', (_event, bounds) => windowLayouts.recordManualBounds(bounds));
  window.on('will-resize', (_event, bounds) => windowLayouts.recordManualBounds(bounds));
  window.once('ready-to-show', () => window?.show());
  window.on('close', event => { if (!quitting && tray) { event.preventDefault(); window?.hide(); } });
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('preload-error', (_event, _file, error) => console.error('Preload failed:', error.message));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window!, { type: 'question', buttons: ['계속 작성', '저장하지 않고 종료'], defaultId: 0, cancelId: 0, message: '저장하지 않은 변경이 있습니다.' });
    if (choice === 1) event.preventDefault(); else quitting = false;
  });
  try {
    tray = new Tray(trayIcon()); tray.setToolTip('커맨드 노트'); tray.on('double-click', showSearch);
    tray.setContextMenu(Menu.buildFromTemplate([{ label: '커맨드 노트 열기', click: showSearch }, { type: 'separator' }, { label: '완전 종료', click: () => app.quit() }]));
  } catch { tray = null; }
  if (devUrl) await window.loadURL(devUrl); else await window.loadURL('command-note://app/index.html');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showSearch);
  app.whenReady().then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    let shortcutPreferences: unknown;
    try { shortcutPreferences = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'shortcut.json'), 'utf8')); } catch { /* First launch uses the defaults; unreadable files are preserved. */ }
    shortcuts = new ShortcutController(globalShortcut, persistShortcuts, { show: toggleSearch, toggle: toggleMode });
    shortcuts.initialize(shortcutPreferences);
    store = new NoteStore(app.getPath('userData'));
    transfers = new Transfers(store, () => window!);
    const renderer = path.resolve(directory, '../renderer');
    protocol.handle('command-note', request => {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
      const file = path.resolve(renderer, `.${decodeURIComponent(url.pathname)}`);
      const relative = path.relative(renderer, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    registerIpc(); await createWindow();
  }).catch(error => { dialog.showErrorBox('커맨드 노트 시작 오류', String(error)); app.exit(1); });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', event => { if (!quitting && store) { event.preventDefault(); void Promise.all([store.settle(), shortcuts.settle()]).then(() => { quitting = true; app.quit(); }); } });
  app.on('will-quit', () => { shortcuts?.dispose(); globalShortcut.unregisterAll(); tray?.destroy(); });
}
