export const channels = {
  load: 'library:load', saveNote: 'notes:save', setLifecycle: 'notes:lifecycle', setFavorite: 'library:favorite', touchRecent: 'library:recent', saveAppearance: 'preferences:appearance',
  importMarkdown: 'markdown:import', exportMarkdown: 'markdown:export', exportBackup: 'backup:export', inspectBackup: 'backup:inspect', restoreBackup: 'backup:restore',
  getShortcut: 'shortcut:get', setShortcut: 'shortcut:set', setModeShortcut: 'shortcut:set-mode', focusSearch: 'search:focus', toggleMode: 'window:toggle-mode', openExternal: 'app:external',
  openDataFolder: 'library:open-folder', setAlwaysOnTop: 'window:pin', setWindowLayout: 'window:layout', minimize: 'window:minimize', hide: 'window:hide', quit: 'app:quit', copyText: 'clipboard:write',
} as const;
