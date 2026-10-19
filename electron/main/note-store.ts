import { createHash, randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { decodeNote, encodeNote, prepareImports } from "../../shared/markdown"
export { decodeNote, encodeNote } from "../../shared/markdown"
import { makeBackup, parseBackup } from "./backup"
import { z } from "zod"
import { initialNotes, initialState } from "../../shared/examples"
import {
  appearanceSchema,
  defaultAppearance,
  libraryStateSchema,
  LibraryError,
  noteSchema,
  type Appearance,
  type LibrarySnapshot,
  type LibraryState,
  type Note,
  type NoteRecord,
  type SaveNoteInput,
  type LifecycleInput,
} from "../../shared/library"

const manifestSchema = z.object({ schemaVersion: z.literal(1) })
const revision = (text: string) =>
  createHash("sha256").update(text).digest("hex")
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT"

export class NoteStore {
  readonly vaultPath: string
  private readonly notesPath: string
  private readonly backupsPath: string
  private tail: Promise<unknown> = Promise.resolve()
  private initialized = false

  constructor(private readonly dataPath: string) {
    this.vaultPath = path.join(dataPath, "vault")
    this.notesPath = path.join(this.vaultPath, "notes")
    this.backupsPath = path.join(this.vaultPath, "backups")
  }

  private run<T,>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(async () => {
      await this.initialize()
      return operation()
    })
    this.tail = task.catch(() => undefined)
    return task
  }

  async settle() {
    await this.tail
  }

  private async assertRegular(file: string) {
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LibraryError("IO_ERROR", "일반 파일만 읽고 저장할 수 있습니다.")
    if (stat.size > 1_000_000)
      throw new LibraryError(
        "VALIDATION_ERROR",
        "문서가 너무 큽니다. 최대 크기는 1MB입니다.",
      )
  }

  private async read(file: string): Promise<string> {
    await this.assertRegular(file)
    return fs.readFile(file, "utf8")
  }

  private async write(file: string, text: string, backupName?: string) {
    const temporary = `${file}.${randomUUID()}.tmp`
    let handle
    try {
      // Reject links before either replacing or backing up an existing file.
      try {
        await this.assertRegular(file)
        if (backupName) {
          const backup = path.join(this.backupsPath, backupName)
          try {
            await this.assertRegular(backup)
          } catch (error) {
            if (!missing(error)) throw error
          }
          await fs.copyFile(file, backup)
        }
      } catch (error) {
        if (!missing(error)) throw error
      }
      handle = await fs.open(temporary, "wx")
      await handle.writeFile(text, "utf8")
      await handle.sync()
      await handle.close()
      handle = undefined
      await fs.rename(temporary, file)
    } finally {
      await handle?.close()
      await fs.unlink(temporary).catch(() => undefined)
    }
  }

  private async initialize() {
    if (this.initialized) return
    await fs.mkdir(this.dataPath, { recursive: true });
    await this.recoverRestore();
    for (const directory of [
      this.dataPath,
      this.vaultPath,
      this.notesPath,
      this.backupsPath,
    ]) {
      await fs.mkdir(directory, { recursive: true })
      const stat = await fs.lstat(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new LibraryError(
          "IO_ERROR",
          "데이터 폴더가 일반 디렉터리가 아닙니다.",
        )
    }
    const manifest = path.join(this.vaultPath, "manifest.json")
    try {
      manifestSchema.parse(JSON.parse(await this.read(manifest)))
    } catch (error) {
      if (!missing(error))
        throw new LibraryError(
          "UNSUPPORTED_SCHEMA",
          "데이터 폴더의 형식 또는 버전을 확인해 주세요. 기존 파일은 보존됩니다.",
        )
      const existing = await fs.readdir(this.vaultPath)
      if (
        (await fs.readdir(this.notesPath)).length ||
        existing.some((name) => !["notes", "backups"].includes(name))
      ) {
        throw new LibraryError(
          "IO_ERROR",
          "기존 데이터에 manifest.json이 없습니다. 초기화하지 않고 원본을 보존합니다.",
        )
      }
      // The manifest is written first. A later startup never resets user files.
      await this.write(manifest, JSON.stringify({ schemaVersion: 1 }, null, 2))
      await this.write(
        path.join(this.vaultPath, "library-state.json"),
        JSON.stringify(initialState, null, 2),
      )
      for (const note of initialNotes)
        await this.write(this.notePath(note.id), encodeNote(note))
    }
    this.initialized = true
  }

  private notePath(id: string) {
    z.string().uuid().parse(id)
    return path.join(this.notesPath, `${id}.md`)
  }

  private async record(id: string): Promise<NoteRecord> {
    const raw = await this.read(this.notePath(id))
    const note = decodeNote(raw)
    if (note.id !== id)
      throw new LibraryError(
        "VALIDATION_ERROR",
        "파일 이름과 문서 ID가 다릅니다.",
      )
    return { note, revision: revision(raw) }
  }

  private async readState(): Promise<LibraryState> {
    return libraryStateSchema.parse(
      JSON.parse(
        await this.read(path.join(this.vaultPath, "library-state.json")),
      ),
    )
  }

  private async appearance(): Promise<Appearance> {
    try {
      return appearanceSchema.parse(
        JSON.parse(
          await this.read(path.join(this.dataPath, "preferences.json")),
        ),
      )
    } catch (error) {
      if (missing(error)) return { ...defaultAppearance }
      throw error
    }
  }

  load(): Promise<LibrarySnapshot> {
    return this.run(async () => {
      const records: NoteRecord[] = []
      const issues: string[] = []
      for (const name of await fs.readdir(this.notesPath)) {
        if (!name.endsWith(".md")) continue
        try {
          records.push(await this.record(name.slice(0, -3)))
        } catch {
          issues.push(
            `${name}: 읽을 수 없는 문서입니다. 원본 파일을 보존했습니다.`,
          )
        }
      }
      records.sort(
        (a, b) =>
          a.note.createdAt.localeCompare(b.note.createdAt) ||
          a.note.id.localeCompare(b.note.id),
      )
      return {
        records,
        state: await this.readState(),
        appearance: await this.appearance(),
        issues,
        dataPath: this.vaultPath,
      }
    })
  }

  saveNote(input: SaveNoteInput): Promise<NoteRecord> {
    return this.run(async () => {
      const { note, expectedRevision } = z
        .object({ note: noteSchema, expectedRevision: z.string().nullable() })
        .parse(input)
      let current: NoteRecord | null = null
      try {
        current = await this.record(note.id)
      } catch (error) {
        if (!missing(error)) throw error
      }
      if ((current?.revision ?? null) !== expectedRevision)
        throw new LibraryError(
          "CONFLICT",
          "다른 곳에서 문서가 변경되었습니다. 초안을 복사한 뒤 다시 불러와 주세요.",
        )
      const saved = {
        ...note,
        createdAt: current?.note.createdAt ?? note.createdAt,
        updatedAt: new Date().toISOString(),
      }
      for (const step of saved.steps) {
        if (!step.noteId) continue;
        const linked = await this.record(step.noteId);
        if (linked.note.type === 'workflow') throw new LibraryError('VALIDATION_ERROR', '작업 단계에는 명령어 또는 화면 조작 카드를 연결해 주세요.');
      }
      const raw = encodeNote(saved)
      if (Buffer.byteLength(raw, "utf8") > 1_000_000)
        throw new LibraryError(
          "VALIDATION_ERROR",
          "문서 크기는 1MB 이하여야 합니다.",
        )
      await this.write(this.notePath(note.id), raw, `${note.id}.md.bak`)
      return { note: saved, revision: revision(raw) }
    })
  }

  private updateState(
    change: (state: LibraryState) => LibraryState,
  ): Promise<LibraryState> {
    return this.run(async () => {
      const state = libraryStateSchema.parse(change(await this.readState()))
      await this.write(
        path.join(this.vaultPath, "library-state.json"),
        JSON.stringify(state, null, 2),
        "library-state.json.bak",
      )
      return state
    })
  }

  setFavorite(id: string, favorite: boolean) {
    z.string().uuid().parse(id)
    z.boolean().parse(favorite)
    return this.updateState((state) => ({
      ...state,
      favorites: favorite
        ? [...new Set([...state.favorites, id])]
        : state.favorites.filter((item) => item !== id),
    }))
  }

  touchRecent(id: string) {
    z.string().uuid().parse(id)
    return this.updateState((state) => ({
      ...state,
      recent: [id, ...state.recent.filter((item) => item !== id)].slice(0, 5),
    }))
  }

  setLifecycle(input: LifecycleInput): Promise<NoteRecord> {
    return this.run(async () => {
      const change = z.object({ id: z.string().uuid(), expectedRevision: z.string(), lifecycle: z.enum(['active', 'archived', 'deleted']) }).parse(input);
      const current = await this.record(change.id);
      if (current.revision !== change.expectedRevision) throw new LibraryError('CONFLICT', '문서가 변경되었습니다. 목록을 다시 불러와 주세요.');
      const note = { ...current.note, lifecycle: change.lifecycle, lifecycleAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const raw = encodeNote(note);
      await this.write(this.notePath(note.id), raw, `${note.id}.md.bak`);
      return { note, revision: revision(raw) };
    });
  }

  importMarkdown(files: { name: string; content: string }[]): Promise<number> {
    return this.run(async () => {
      const inputs = z.array(z.object({ name: z.string().max(500), content: z.string().max(1_000_000) })).max(200).parse(files);
      const existing = new Set((await fs.readdir(this.notesPath)).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3)));
      const notes = prepareImports(inputs, existing);
      const allowed = new Map<string, Note>();
      for (const note of notes) allowed.set(note.id, note);
      for (const note of notes) for (const step of note.steps) {
        if (!step.noteId) continue;
        const linked = allowed.get(step.noteId) ?? (await this.record(step.noteId)).note;
        if (linked.type === 'workflow') throw new LibraryError('VALIDATION_ERROR', '작업 단계가 다른 작업 순서를 참조합니다.');
      }
      const written: string[] = [];
      try {
        for (const note of notes) {
          const file = this.notePath(note.id);
          await fs.writeFile(file, encodeNote(note), { flag: 'wx', encoding: 'utf8' });
          written.push(file);
        }
      } catch (error) {
        for (const file of written) await fs.unlink(file);
        throw error;
      }
      return notes.length;
    });
  }

  exportMarkdown(ids: string[]): Promise<{ name: string; content: string }[]> {
    return this.run(async () => {
      z.array(z.string().uuid()).min(1).max(2000).parse(ids);
      const selected = new Map<string, Note>();
      for (const id of ids) {
        const note = (await this.record(id)).note;
        selected.set(id, note);
        for (const step of note.steps) if (step.noteId) selected.set(step.noteId, (await this.record(step.noteId)).note);
      }
      return [...selected.values()].map(note => ({ name: `${note.id}.md`, content: encodeNote(note) }));
    });
  }

  backup(): Promise<Uint8Array> {
    return this.run(async () => {
      const notes: Note[] = [];
      for (const name of await fs.readdir(this.notesPath)) if (name.endsWith('.md')) notes.push((await this.record(name.slice(0, -3))).note);
      return makeBackup(notes, await this.readState());
    });
  }

  restoreBackup(bytes: Uint8Array): Promise<void> {
    return this.run(async () => {
      const { notes, state } = parseBackup(bytes);
      const stagingName = `restore-stage-${randomUUID()}`;
      const previousName = `vault-before-restore-${randomUUID()}`;
      const staging = path.join(this.dataPath, stagingName);
      const previous = path.join(this.dataPath, previousName);
      await fs.mkdir(path.join(staging, 'notes'), { recursive: true });
      await fs.mkdir(path.join(staging, 'backups'));
      for (const note of notes) await fs.writeFile(path.join(staging, 'notes', `${note.id}.md`), encodeNote(note), { flag: 'wx', encoding: 'utf8' });
      await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ schemaVersion: 1 }));
      await fs.writeFile(path.join(staging, 'library-state.json'), JSON.stringify(state));
      await this.write(path.join(this.dataPath, 'restore-journal.json'), JSON.stringify({ stagingName, previousName }));
      await fs.rename(this.vaultPath, previous);
      try { await fs.rename(staging, this.vaultPath); }
      catch (error) { await fs.rename(previous, this.vaultPath); throw error; }
      await fs.unlink(path.join(this.dataPath, 'restore-journal.json'));
      this.initialized = false;
    });
  }

  private async recoverRestore() {
    const journal = path.join(this.dataPath, 'restore-journal.json');
    let data;
    try { data = JSON.parse(await this.read(journal)); }
    catch (error) { if (missing(error)) return; throw error; }
    const valid = z.object({ stagingName: z.string().regex(/^restore-stage-[0-9a-f-]{36}$/), previousName: z.string().regex(/^vault-before-restore-[0-9a-f-]{36}$/) }).parse(data);
    try { await fs.access(this.vaultPath); }
    catch (error) {
      if (!missing(error)) throw error;
      const previous = path.join(this.dataPath, valid.previousName);
      const stat = await fs.lstat(previous);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LibraryError('IO_ERROR', '복원 전 데이터 경로를 확인해 주세요.');
      await fs.rename(previous, this.vaultPath);
    }
    await fs.unlink(journal);
  }

  saveAppearance(value: Appearance): Promise<Appearance> {
    return this.run(async () => {
      const appearance = appearanceSchema.parse(value)
      await this.write(
        path.join(this.dataPath, "preferences.json"),
        JSON.stringify(appearance, null, 2),
        "preferences.json.bak",
      )
      return appearance
    })
  }
}
