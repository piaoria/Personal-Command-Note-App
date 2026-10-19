import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../../shared/channels';
import type { DesktopApi } from '../../shared/library';
const api: DesktopApi = {
  load: () => ipcRenderer.invoke(channels.load), saveNote: input => ipcRenderer.invoke(channels.saveNote, input), setLifecycle: input => ipcRenderer.invoke(channels.setLifecycle, input),
  setFavorite: (id, favorite) => ipcRenderer.invoke(channels.setFavorite, id, favorite), touchRecent: id => ipcRenderer.invoke(channels.touchRecent, id), saveAppearance: value => ipcRenderer.invoke(channels.saveAppearance, value),
  importMarkdown: () => ipcRenderer.invoke(channels.importMarkdown), exportMarkdown: ids => ipcRenderer.invoke(channels.exportMarkdown, ids), exportBackup: () => ipcRenderer.invoke(channels.exportBackup),
  inspectBackup: () => ipcRenderer.invoke(channels.inspectBackup), restoreBackup: token => ipcRenderer.invoke(channels.restoreBackup, token),
  getShortcut: () => ipcRenderer.invoke(channels.getShortcut), setShortcut: value => ipcRenderer.invoke(channels.setShortcut, value), setModeShortcut: value => ipcRenderer.invoke(channels.setModeShortcut, value),
  onFocusSearch: callback => { const listener = () => callback(); ipcRenderer.on(channels.focusSearch, listener); return () => { ipcRenderer.removeListener(channels.focusSearch, listener); }; },
  onToggleMode: callback => { const listener = () => callback(); ipcRenderer.on(channels.toggleMode, listener); return () => { ipcRenderer.removeListener(channels.toggleMode, listener); }; },
  openExternal: url => ipcRenderer.invoke(channels.openExternal, url), openDataFolder: () => ipcRenderer.invoke(channels.openDataFolder), setAlwaysOnTop: value => ipcRenderer.invoke(channels.setAlwaysOnTop, value),
  setWindowLayout: input => ipcRenderer.invoke(channels.setWindowLayout, input),
  minimize: () => ipcRenderer.invoke(channels.minimize), hide: () => ipcRenderer.invoke(channels.hide), quit: () => ipcRenderer.invoke(channels.quit), copyText: text => ipcRenderer.invoke(channels.copyText, text),
};
contextBridge.exposeInMainWorld('commandNote', api);
