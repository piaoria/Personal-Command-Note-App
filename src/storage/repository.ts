import { initialNotes, initialState } from "../../shared/examples"
import {
  appearanceSchema,
  defaultAppearance,
  LibraryError,
  noteSchema,
  migrateNote,
  unwrap,
  type LibraryRepository,
  type LibrarySnapshot,
} from "../../shared/library"

export const isDesktop = import.meta.env.VITE_DESKTOP === "true"

const desktopRepository: LibraryRepository = {
  load: async () => unwrap(await api().load()),
  setLifecycle: async input => unwrap(await api().setLifecycle(input)),
  saveNote: async (input) => unwrap(await api().saveNote(input)),
  setFavorite: async (id, favorite) =>
    unwrap(await api().setFavorite(id, favorite)),
  touchRecent: async (id) => unwrap(await api().touchRecent(id)),
  saveAppearance: async (value) => unwrap(await api().saveAppearance(value)),
}

function api() {
  if (!window.commandNote)
    throw new Error(
      "데스크톱 저장 기능을 연결하지 못했습니다. 앱을 다시 시작해 주세요.",
    )
  return window.commandNote
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("command-note-preview", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("library")
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

function seed(): LibrarySnapshot {
  return {
    records: initialNotes.map((note) => ({
      note,
      revision: crypto.randomUUID(),
    })),
    state: structuredClone(initialState),
    appearance: { ...defaultAppearance },
    issues: [],
    dataPath: "브라우저 미리보기 · Windows 앱과 별도 저장",
  }
}

async function transaction<T>(
  change: (snapshot: LibrarySnapshot) => T,
): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("library", "readwrite")
    const store = tx.objectStore("library")
    const request = store.get("snapshot")
    let value: T
    let failure: unknown
    request.onsuccess = () => {
      try {
        const snapshot: LibrarySnapshot = request.result ?? seed()
        // A malformed existing snapshot is an error, never a reason to reseed.
        snapshot.records.forEach(record => { record.note = migrateNote(record.note); })
        snapshot.appearance = appearanceSchema.parse(snapshot.appearance)
        value = change(snapshot)
        store.put(snapshot, "snapshot")
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(value)
    tx.onerror = tx.onabort = () =>
      reject(failure ?? tx.error ?? new Error("미리보기 저장에 실패했습니다."))
  })
}

const previewRepository: LibraryRepository = {
  setLifecycle: input => transaction(snapshot => {
    const record = snapshot.records.find(record => record.note.id === input.id);
    if (!record || record.revision !== input.expectedRevision) throw new LibraryError("CONFLICT", "문서가 변경되었습니다.");
    record.note = noteSchema.parse({ ...record.note, lifecycle: input.lifecycle, lifecycleAt: new Date().toISOString() }); record.revision = crypto.randomUUID(); return structuredClone(record);
  }),
  load: () => transaction((snapshot) => structuredClone(snapshot)),
  saveNote: (input) =>
    transaction((snapshot) => {
      const note = noteSchema.parse(input.note)
      const current = snapshot.records.find(
        (record) => record.note.id === note.id,
      )
      if ((current?.revision ?? null) !== input.expectedRevision)
        throw new LibraryError(
          "CONFLICT",
          "문서가 변경되었습니다. 초안을 복사한 뒤 다시 불러와 주세요.",
        )
      const record = {
        note: { ...note, updatedAt: new Date().toISOString() },
        revision: crypto.randomUUID(),
      }
      snapshot.records = current
        ? snapshot.records.map((item) =>
            item.note.id === note.id ? record : item,
          )
        : [...snapshot.records, record]
      return record
    }),
  setFavorite: (id, favorite) =>
    transaction((snapshot) => {
      snapshot.state.favorites = favorite
        ? [...new Set([...snapshot.state.favorites, id])]
        : snapshot.state.favorites.filter((item) => item !== id)
      return structuredClone(snapshot.state)
    }),
  touchRecent: (id) =>
    transaction((snapshot) => {
      snapshot.state.recent = [
        id,
        ...snapshot.state.recent.filter((item) => item !== id),
      ].slice(0, 5)
      return structuredClone(snapshot.state)
    }),
  saveAppearance: (value) =>
    transaction((snapshot) => {
      snapshot.appearance = appearanceSchema.parse(value)
      return { ...snapshot.appearance }
    }),
}

export const repository = isDesktop ? desktopRepository : previewRepository
