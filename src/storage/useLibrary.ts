import { useCallback, useEffect, useRef, useState } from "react"
import {
  defaultAppearance,
  type Appearance,
  type LibrarySnapshot,
  type Note,
  type LifecycleInput,
} from "../../shared/library"
import { repository } from "./repository"

export default function useLibrary() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>({
    records: [],
    state: { schemaVersion: 1, favorites: [], recent: [] },
    appearance: defaultAppearance,
    issues: [],
    dataPath: "",
  })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const reload = useCallback(async () => {
    try {
      setSnapshot(await repository.load())
      setError("")
      setReady(true)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "저장 자료를 읽을 수 없습니다.",
      )
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  function run<T>(operation: () => Promise<T>): Promise<T> {
    setPending((count) => count + 1)
    const task = queue.current
      .then(operation)
      .catch((error) => {
        setError(
          error instanceof Error ? error.message : "저장하지 못했습니다.",
        )
        throw error
      })
      .finally(() => setPending((count) => count - 1))
    queue.current = task.catch(() => undefined)
    return task
  }

  const saveNote = (note: Note, expectedRevision: string | null) =>
    run(async () => {
      const record = await repository.saveNote({ note, expectedRevision })
      setSnapshot((old) => ({
        ...old,
        records: old.records.some((item) => item.note.id === note.id)
          ? old.records.map((item) =>
              item.note.id === note.id ? record : item,
            )
          : [...old.records, record],
      }))
      setError("")
      return record.note
    })

  const setLifecycle = (input: LifecycleInput) => run(async () => {
    const record = await repository.setLifecycle(input);
    setSnapshot(old => ({ ...old, records: old.records.map(item => item.note.id === record.note.id ? record : item) }));
    return record.note;
  });

  const setFavorite = (id: string, favorite: boolean) =>
    run(async () => {
      const state = await repository.setFavorite(id, favorite)
      setSnapshot((old) => ({ ...old, state }))
    })

  const touchRecent = (id: string) =>
    run(async () => {
      const state = await repository.touchRecent(id)
      setSnapshot((old) => ({ ...old, state }))
    })

  const saveAppearance = (appearance: Appearance) => {
    setSnapshot((old) => ({ ...old, appearance }))
    return run(() => repository.saveAppearance(appearance))
  }

  return {
    ...snapshot,
    notes: snapshot.records.map((record) => record.note),
    ready,
    error,
    pending: pending > 0,
    saveNote,
    setLifecycle,
    setFavorite,
    touchRecent,
    saveAppearance,
    reload,
    reportError: (error: unknown) =>
      setError(String(error instanceof Error ? error.message : error)),
  }
}
