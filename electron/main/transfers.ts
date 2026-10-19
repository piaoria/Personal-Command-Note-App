import { dialog, type BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LibraryError, type BackupPreview } from '../../shared/library';
import { parseBackup } from './backup';
import type { NoteStore } from './note-store';

export default class Transfers {
  private pending: { token: string; bytes: Uint8Array; expires: number } | null = null;
  constructor(private store: NoteStore, private getWindow: () => BrowserWindow) {}

  async importMarkdown() {
    const selection = await dialog.showOpenDialog(this.getWindow(), { title: 'Markdown 가져오기', filters: [{ name: 'Markdown', extensions: ['md'] }], properties: ['openFile', 'multiSelections'] });
    if (selection.canceled) return { count: 0, canceled: true };
    if (selection.filePaths.length > 200) throw new LibraryError('VALIDATION_ERROR', '한 번에 200개까지 선택해 주세요.');
    const files = await Promise.all(selection.filePaths.map(async file => {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new LibraryError('VALIDATION_ERROR', 'Markdown은 1MB 이하의 일반 파일이어야 합니다.');
      return { name: path.basename(file), content: await fs.readFile(file, 'utf8') };
    }));
    return { count: await this.store.importMarkdown(files) };
  }

  async exportMarkdown(ids: string[]) {
    const files = await this.store.exportMarkdown(ids);
    if (files.length === 1) {
      const target = await dialog.showSaveDialog(this.getWindow(), { title: 'Markdown 내보내기', defaultPath: files[0].name, filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (target.canceled || !target.filePath) return { count: 0, canceled: true };
      await fs.writeFile(target.filePath, files[0].content, 'utf8');
    } else {
      const target = await dialog.showOpenDialog(this.getWindow(), { title: '내보낼 상위 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
      if (target.canceled) return { count: 0, canceled: true };
      const folder = path.join(target.filePaths[0], `CommandNote-Markdown-${randomUUID()}`);
      await fs.mkdir(folder);
      for (const file of files) await fs.writeFile(path.join(folder, file.name), file.content, { encoding: 'utf8', flag: 'wx' });
    }
    return { count: files.length };
  }

  async exportBackup() {
    const target = await dialog.showSaveDialog(this.getWindow(), { title: '전체 노트 백업', defaultPath: `CommandNote-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: 'ZIP 백업', extensions: ['zip'] }] });
    if (target.canceled || !target.filePath) return false;
    await fs.writeFile(target.filePath, await this.store.backup());
    return true;
  }

  async inspectBackup(): Promise<BackupPreview | null> {
    const target = await dialog.showOpenDialog(this.getWindow(), { title: '복원할 백업 선택', filters: [{ name: 'ZIP 백업', extensions: ['zip'] }], properties: ['openFile'] });
    if (target.canceled) return null;
    const stat = await fs.lstat(target.filePaths[0]);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50_000_000) throw new LibraryError('VALIDATION_ERROR', '50MB 이하의 ZIP 백업을 선택해 주세요.');
    const bytes = await fs.readFile(target.filePaths[0]);
    const parsed = parseBackup(bytes);
    const token = randomUUID();
    this.pending = { token, bytes, expires: Date.now() + 10 * 60_000 };
    return { token, notes: parsed.notes.length, archived: parsed.notes.filter(note => note.lifecycle === 'archived').length, deleted: parsed.notes.filter(note => note.lifecycle === 'deleted').length };
  }

  async restoreBackup(token: string) {
    z.string().uuid().parse(token);
    const pending = this.pending;
    if (!pending || pending.token !== token || pending.expires < Date.now()) throw new LibraryError('VALIDATION_ERROR', '백업 선택 시간이 만료되었습니다. 다시 선택해 주세요.');
    this.pending = null;
    await this.store.restoreBackup(pending.bytes);
  }
}
