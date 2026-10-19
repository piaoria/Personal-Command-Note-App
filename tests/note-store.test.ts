import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { decodeNote, encodeNote, NoteStore } from "../electron/main/note-store"
import { initialNotes } from "../shared/examples"
import { LibraryError } from "../shared/library"

async function fixture() {
  const root = path.resolve(".test-data")
  await fs.mkdir(root, { recursive: true })
  const directory = await fs.mkdtemp(path.join(root, "한글 공백-"))
  return { directory, store: new NoteStore(directory) }
}

test("Markdown round-trip preserves multiline commands, body, and extra metadata", () => {
  const note = {
    ...initialNotes[0],
    command: "cd \"C:\\작업 폴더\"\nWrite-Output 'hello'",
    description: "\n# 결과\n---\n끝\n",
    futureField: { retained: true },
  }
  assert.deepEqual(decodeNote(encodeNote(note)), note)
})

test("a fresh process reads created and edited notes, favorites, recent items, and appearance", async () => {
  const { directory, store } = await fixture()
  const first = await store.load()
  assert.equal(first.records.length, 9)
  const note = {
    ...initialNotes[0],
    id: randomUUID(),
    title: "재실행 저장 확인",
    command: 'Get-ChildItem "C:\\한글 경로"',
    description: "작성한 내용\n두 번째 줄",
  }
  const created = await store.saveNote({ note, expectedRevision: null })
  const edited = await store.saveNote({
    note: { ...created.note, title: "수정한 제목" },
    expectedRevision: created.revision,
  })
  await Promise.all([
    store.setFavorite(note.id, true),
    store.setFavorite(first.records[0].note.id, false),
    store.touchRecent(note.id),
  ])
  await store.saveAppearance({ dark: true, opacity: 75, mode: 'simple' })
  await store.settle()
  const restarted = await new NoteStore(directory).load()
  assert.deepEqual(
    restarted.records.find((record) => record.note.id === note.id),
    edited,
  )
  assert.ok(restarted.state.favorites.includes(note.id))
  assert.ok(!restarted.state.favorites.includes(first.records[0].note.id))
  assert.equal(restarted.state.recent[0], note.id)
  assert.deepEqual(restarted.appearance, { dark: true, opacity: 75, mode: 'simple' })
  assert.equal(restarted.records.length, 10)
})

test("external changes reject a stale save without overwriting the file", async () => {
  const { store } = await fixture()
  const first = (await store.load()).records[0]
  const file = path.join(store.vaultPath, "notes", `${first.note.id}.md`)
  const external = encodeNote({ ...first.note, title: "외부 편집기의 변경" })
  await fs.writeFile(file, external, "utf8")
  await assert.rejects(
    store.saveNote({
      note: { ...first.note, title: "오래된 초안" },
      expectedRevision: first.revision,
    }),
    (error: unknown) =>
      error instanceof LibraryError && error.code === "CONFLICT",
  )
  assert.equal(await fs.readFile(file, "utf8"), external)
})

test("a corrupt note is reported and preserved while valid notes stay readable", async () => {
  const { store } = await fixture()
  const first = (await store.load()).records[0]
  const file = path.join(store.vaultPath, "notes", `${first.note.id}.md`)
  const broken = "---\nschemaVersion: 900\nid: broken\n---\n보존할 원문"
  await fs.writeFile(file, broken, "utf8")
  const snapshot = await store.load()
  assert.equal(snapshot.records.length, 8)
  assert.equal(snapshot.issues.length, 1)
  await assert.rejects(
    store.saveNote({ note: first.note, expectedRevision: null }),
  )
  assert.equal(await fs.readFile(file, "utf8"), broken)
})

test("a failed backup leaves the original intact and the next operation can recover", async () => {
  const { store } = await fixture()
  const first = (await store.load()).records[0]
  const backup = path.join(
    store.vaultPath,
    "backups",
    `${first.note.id}.md.bak`,
  )
  await fs.mkdir(backup)
  await assert.rejects(
    store.saveNote({
      note: { ...first.note, title: "저장 실패" },
      expectedRevision: first.revision,
    }),
  )
  assert.deepEqual(
    (await store.load()).records.find(
      (record) => record.note.id === first.note.id,
    ),
    first,
  )
  await store.touchRecent(first.note.id)
  assert.equal((await store.load()).state.recent[0], first.note.id)
})

test("existing data without a manifest is never initialized over", async () => {
  const { directory } = await fixture()
  const notes = path.join(directory, "vault", "notes")
  await fs.mkdir(notes, { recursive: true })
  await fs.writeFile(path.join(notes, "existing.md"), "원본", "utf8")
  await assert.rejects(new NoteStore(directory).load())
  assert.equal(
    await fs.readFile(path.join(notes, "existing.md"), "utf8"),
    "원본",
  )
  await assert.rejects(
    fs.access(path.join(directory, "vault", "manifest.json")),
  )
})

test("unknown library versions and invalid IDs are refused", async () => {
  const { directory, store } = await fixture()
  await store.load()
  await assert.rejects(
    store.saveNote({
      note: { ...initialNotes[0], id: "../outside" },
      expectedRevision: null,
    }),
  )
  await fs.writeFile(
    path.join(store.vaultPath, "manifest.json"),
    '{"schemaVersion":900}',
    "utf8",
  )
  await assert.rejects(new NoteStore(directory).load())
})
