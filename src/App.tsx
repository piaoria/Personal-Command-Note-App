import { useEffect, useRef, useState } from 'react';
import { blankNote, unwrap, type Note } from '../shared/library';
import useLibrary from './storage/useLibrary';
import { detectCommandVariables, fillCommand } from '../shared/commands';
import { findAppCommands, findAppShortcut, type AppCommandId } from '../shared/app-commands';
import { isDesktop } from './storage/repository';
import Icon from './components/Icon';
import AppIcon from './components/AppIcon';
import ToolIcon from './components/ToolIcon';
import SimpleSearch from './components/SimpleSearch';
import ParameterCopy, { parameterCopyHeight } from './components/ParameterCopy';
import AppCommandList from './components/AppCommandList';
import NoteEditor, { typeLabels } from './components/NoteEditor';
import NoteDetail from './components/NoteDetail';
import LibraryManager from './components/LibraryManager';

type View = 'active' | 'archived' | 'deleted' | 'manager';
export default function App() {
  const library = useLibrary();
  const { notes, appearance, state: { favorites, recent } } = library;
  const [view, setView] = useState<View>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parameterNoteId, setParameterNoteId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ note: Note; revision: string | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [scope, setScope] = useState('all');
  const [pinned, setPinned] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState('');
  const [working, setWorking] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const selected = notes.find(note => note.id === selectedId);
  const parameterNote = notes.find(note => note.id === parameterNoteId);
  const simple = appearance.mode === 'simple' && view === 'active' && !selectedId && !editor;
  const busy = working || library.pending;
  const notify = (message: string) => setToast(message);
  const guard = () => !busy && (!editor || !dirty || window.confirm('저장하지 않은 편집 내용을 취소하고 이동할까요?'));
  const navigate = (next: View) => { if (!guard()) return; setParameterNoteId(null); setEditor(null); setDirty(false); setSelectedId(null); setTrail([]); setView(next); setQuery(''); };
  const open = (note: Note, linked = false) => {
    if (!guard()) return;
    setParameterNoteId(null); setEditor(null); setDirty(false); setSelectedId(note.id); setTrail(old => linked && selectedId ? [...old, selectedId] : []);
    void library.touchRecent(note.id).catch(() => undefined);
    if (scroll.current) scroll.current.scrollTop = 0;
  };
  const back = () => { if (trail.length) { setSelectedId(trail[trail.length - 1]); setTrail(trail.slice(0, -1)); } else setSelectedId(null); };
  const startEdit = (note?: Note) => {
    if (!guard()) return;
    setEditor({ note: note ?? blankNote(category || 'Docker'), revision: note ? library.records.find(record => record.note.id === note.id)?.revision ?? null : null }); setDirty(false);
  };
  const switchMode = (mode: 'simple' | 'expanded') => {
    if (editor || parameterNote) { notify('작성·입력을 마친 뒤 모드를 전환할 수 있습니다'); return; }
    if (!guard()) return;
    setSelectedId(null); setTrail([]); setView('active'); setCategory(''); setType(''); setScope('all');
    void library.saveAppearance({ ...appearance, mode }).catch(() => undefined);
    requestAnimationFrame(() => search.current?.focus());
  };
  const copy = async (text: string) => { try { if (isDesktop) unwrap(await window.commandNote!.copyText(text)); else await navigator.clipboard.writeText(text); notify('클립보드에 복사했어요'); return true; } catch (error) { library.reportError(error); return false; } };
  const togglePin = async () => { try { setPinned(isDesktop ? unwrap(await window.commandNote!.setAlwaysOnTop(!pinned)) : !pinned); } catch (error) { library.reportError(error); } };
  const hideWindow = () => { if (isDesktop) void window.commandNote!.hide().then(unwrap).catch(library.reportError); else setHidden(true); };
  const runAppCommand = (id: AppCommandId) => {
    if (busy || editor || parameterNote) return;
    setQuery('');
    if (id === 'hide') hideWindow();
    else switchMode(id === 'toggle' ? (simple ? 'expanded' : 'simple') : id);
  };
  const star = (note: Note) => { void library.setFavorite(note.id, !favorites.includes(note.id)).catch(() => undefined); };
  const lifecycle = async (note: Note, next: Note['lifecycle']) => {
    if (busy) return;
    const references = notes.filter(item => item.lifecycle === 'active' && item.steps.some(step => step.noteId === note.id));
    if (next !== 'active' && !window.confirm(`${next === 'archived' ? '보관함' : '휴지통'}으로 이동할까요? 나중에 복구할 수 있습니다.${references.length ? `\n연결된 작업: ${references.map(item => item.title).join(', ')}` : ''}`)) return;
    const record = library.records.find(record => record.note.id === note.id);
    if (!record) return;
    try { await library.setLifecycle({ id: note.id, expectedRevision: record.revision, lifecycle: next }); notify(next === 'active' ? '노트를 복구했습니다' : '노트를 이동했습니다'); } catch { /* The library displays the error. */ }
  };
  const quickCopy = (note: Note) => {
    if (!guard()) return;
    if (note.type === 'workflow' || !note.command) { open(note); return; }
    if (note.variables.length || detectCommandVariables(note.command).length) {
      setParameterNoteId(note.id);
      void library.touchRecent(note.id).catch(() => undefined);
      return;
    }
    try { void copy(fillCommand(note, {})); } catch { open(note); }
  };
  const exportNote = async (note: Note) => { setWorking(true); try { const result = unwrap(await window.commandNote!.exportMarkdown([note.id])); if (!result.canceled) notify(`${result.count}개 Markdown 파일을 내보냈습니다`); } catch (error) { library.reportError(error); } finally { setWorking(false); } };
  const openLink = (url: string) => { if (isDesktop) void window.commandNote!.openExternal(url).then(unwrap).catch(library.reportError); else window.open(url, '_blank', 'noopener,noreferrer'); };
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener);
  }, [dirty, busy]);
  useEffect(() => {
    const focus = () => { setHidden(false); if (editor || parameterNote) { notify('작성·입력을 마치면 검색할 수 있습니다'); return; } setSelectedId(null); setView('active'); requestAnimationFrame(() => search.current?.focus()); };
    const toggleMode = () => { setHidden(false); switchMode(simple ? 'expanded' : 'simple'); };
    const key = (event: KeyboardEvent) => {
      const shortcut = findAppShortcut(event);
      if (shortcut) {
        event.preventDefault();
        if (!event.repeat) { if (shortcut === 'search') focus(); else toggleMode(); }
        return;
      }
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        if (parameterNote) setParameterNoteId(null);
        else if (editor) { if (guard()) { setEditor(null); setDirty(false); } }
        else if (selectedId) back();
        else if (findAppCommands(query).length) setQuery('');
        else hideWindow();
      }
    };
    window.addEventListener('keydown', key);
    const unsubscribe = isDesktop ? window.commandNote?.onFocusSearch(focus) : undefined;
    const unsubscribeMode = isDesktop ? window.commandNote?.onToggleMode(toggleMode) : undefined;
    return () => { window.removeEventListener('keydown', key); unsubscribe?.(); unsubscribeMode?.(); };
  }, [editor, dirty, selectedId, trail, busy, parameterNote, simple, appearance.mode, query]);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const appCommands = findAppCommands(query);
  const simpleResults = query.trim() && !appCommands.length ? notes.filter(note => note.lifecycle === 'active' && words.every(word => `${note.title} ${note.command} ${note.description} ${note.expectedResult} ${note.category} ${note.tag}`.toLocaleLowerCase().includes(word))).slice(0, 6) : [];
  const compactHeight = parameterNote ? parameterCopyHeight(parameterNote.variables.length) : undefined;
  useEffect(() => {
    if (!isDesktop || (!library.ready && !library.error)) return;
    void window.commandNote!.setWindowLayout({ mode: library.ready && simple ? 'simple' : 'expanded', resultCount: simpleResults.length + appCommands.length, hasQuery: !!query.trim(), ...(compactHeight ? { contentHeight: compactHeight } : {}) }).then(unwrap).catch(library.reportError);
  }, [library.ready, !!library.error, simple, simpleResults.length, appCommands.length, !!query.trim(), compactHeight]);
  const titlebar = <div className="titlebar">
    <div className="brand"><AppIcon />커맨드 노트<span className="personal">PERSONAL</span></div>
    <div className="action-row">
      <button className={`icon-button ${pinned ? 'pin-active' : ''}`} title={pinned ? '항상 위 고정 해제' : '항상 위 고정'} aria-label="항상 위 고정" aria-pressed={pinned} onClick={() => void togglePin()}><Icon name="pin" /></button>
      <button className="icon-button mode-toggle" title={editor || parameterNote ? '작성·입력을 마친 뒤 전환할 수 있습니다' : '심플 모드로 전환 (Ctrl+Shift+M)'} aria-label="심플 모드로 전환" aria-keyshortcuts="Control+Shift+M" disabled={!library.ready || busy || !!editor || !!parameterNote} onClick={() => switchMode('simple')}><Icon name="collapse" /></button>
      <button className="icon-button" title="창 최소화" aria-label="창 최소화" onClick={() => { if (isDesktop) void window.commandNote!.minimize().then(unwrap).catch(library.reportError); else setHidden(true); }}><Icon name="minus" /></button>
      {isDesktop && <button className="icon-button" title="트레이로 숨기기" aria-label="트레이로 숨기기" onClick={() => void window.commandNote!.hide().then(unwrap).catch(library.reportError)}><Icon name="close" /></button>}
    </div>
  </div>;
  if (!library.ready) return <main className={`storage-loading ${isDesktop ? 'desktop-loading' : ''}`}>{isDesktop ? <header>{titlebar}</header> : <h1>커맨드 노트</h1>}{library.error ? <><p role="alert">{library.error}</p><p>기존 파일을 초기화하지 않았습니다.</p><button className="secondary-button" onClick={() => void library.reload()}>다시 불러오기</button></> : <p role="status">노트를 불러오는 중…</p>}</main>;
  const active = notes.filter(note => note.lifecycle === 'active');
  const categories = [...new Set(active.map(note => note.category))];
  let results = notes.filter(note => note.lifecycle === view && (!category || note.category === category) && (!type || note.type === type) && words.every(word => `${note.title} ${note.command} ${note.description} ${note.expectedResult} ${note.category} ${note.tag}`.toLocaleLowerCase().includes(word)));
  if (scope === 'favorites') results = results.filter(note => favorites.includes(note.id));
  if (scope === 'recent') results = results.filter(note => recent.includes(note.id)).sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  const row = (note: Note) => <div className="note-row" key={note.id}><span className="row-icon"><ToolIcon category={note.category} type={note.type} /></span><button className="note-content" onClick={() => open(note)}><span className="note-title">{note.title}</span><span className="note-command">{note.type === 'workflow' ? `${note.steps.length}단계 작업 순서` : note.command || note.description.slice(0, 60)}</span><span className="note-meta">{note.category} · {typeLabels[note.type]} · {note.shell} · {note.risk}</span></button><button className={`icon-button favorite ${favorites.includes(note.id) ? 'active' : ''}`} disabled={busy} aria-label={`${note.title} 즐겨찾기 ${favorites.includes(note.id) ? '해제' : '추가'}`} onClick={() => star(note)}><Icon name="star" size={16} /></button>{note.lifecycle === 'active' && <button className="icon-button" title={note.type === 'workflow' ? '열어서 확인' : note.variables.length || detectCommandVariables(note.command).length ? '값 입력 후 복사' : '명령 복사'} disabled={busy} onClick={() => quickCopy(note)}><Icon name="copy" size={16} /></button>}</div>;
  return <main className={`workspace ${isDesktop ? 'desktop-workspace' : ''} ${simple ? 'simple-workspace' : ''} ${appearance.dark ? 'dark-mode' : ''}`} style={{ '--panel-alpha': isDesktop ? 1 : appearance.opacity / 100 } as React.CSSProperties}>
    {hidden ? <button className="restore" onClick={() => setHidden(false)}>커맨드 노트 열기</button> : simple ? <>
      {parameterNote ? <ParameterCopy key={parameterNote.id} note={parameterNote} compact onClose={() => setParameterNoteId(null)} onCopy={copy} /> : <SimpleSearch query={query} onQueryChange={setQuery} results={simpleResults} commands={appCommands} onCommand={runAppCommand} inputRef={search} busy={busy} pinned={pinned} onTogglePin={() => void togglePin()} onOpen={note => { if (note.variables.length || detectCommandVariables(note.command).length) quickCopy(note); else open(note); }} onCopy={quickCopy} onExpand={() => switchMode('expanded')} onHide={hideWindow} error={library.error || library.issues.join(' / ')} />}
      {toast && <div className="simple-toast" role="status">{toast}</div>}
    </> : <section className="panel" aria-label="개인용 커맨드 노트">
      <header>
        {titlebar}
        <div className="appearance-toolbar"><div className="opacity-control" title={isDesktop ? '창 전체의 불투명도를 조절합니다. 낮추면 뒤의 화면이 비칩니다.' : '웹 미리보기의 패널 배경만 조절합니다. 실제 창의 불투명도는 Windows 앱에서 확인하세요.'}><label htmlFor="panel-opacity">{isDesktop ? '창 불투명도' : '배경 불투명도'}</label><input id="panel-opacity" type="range" min="40" max="100" step="5" value={appearance.opacity} onChange={event => { void library.saveAppearance({ ...appearance, opacity: Number(event.target.value) }).catch(() => undefined); }} /><output>{appearance.opacity}%</output></div><button className="theme-toggle" role="switch" aria-checked={appearance.dark} onClick={() => { void library.saveAppearance({ ...appearance, dark: !appearance.dark }).catch(() => undefined); }}>다크모드 {appearance.dark ? '켜짐' : '꺼짐'}</button></div>
        <div className="search-box"><Icon name="search" /><input ref={search} aria-label="하려는 일이나 명령어 검색" aria-keyshortcuts="Control+k" placeholder="노트 검색 또는 / 앱 명령" disabled={!!editor || !!parameterNote} value={query} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && appCommands[0]) { event.preventDefault(); runAppCommand(appCommands[0].id); } }} onChange={event => { setQuery(event.target.value); setSelectedId(null); if (view === 'manager') setView('active'); }} /><kbd title="검색창으로 이동 (Ctrl+K)">Ctrl+K</kbd></div>
        <nav className="library-nav" aria-label="노트 보기">{([['active', '노트'], ['archived', '보관함'], ['deleted', '휴지통'], ['manager', '자료 관리']] as const).map(([key, label]) => <button disabled={busy} className={view === key ? 'active' : ''} key={key} onClick={() => { navigate(key); setCategory(''); setType(''); setScope('all'); }}>{label}{key !== 'manager' && <small>{notes.filter(note => note.lifecycle === key).length}</small>}</button>)}</nav>
      </header>
      {library.error && <div className="storage-error" role="alert">{library.error}<button className="text-button" disabled={busy} onClick={() => { if (guard()) { setEditor(null); setDirty(false); setSelectedId(null); void library.reload(); } }}>다시 불러오기</button></div>}
      {library.issues.length > 0 && <div className="storage-error" role="alert">{library.issues.join(' / ')}</div>}
      <div className="content" ref={scroll}>
        {editor ? <NoteEditor key={editor.note.id} note={editor.note} notes={notes} onDirty={setDirty} onCancel={() => { if (guard()) { setEditor(null); setDirty(false); } }} onSave={async draft => { const saved = await library.saveNote(draft, editor.revision); setEditor(null); setDirty(false); setSelectedId(saved.id); setView('active'); notify('노트를 저장했습니다'); }} />
        : parameterNote ? <ParameterCopy key={parameterNote.id} note={parameterNote} compact={false} onClose={() => setParameterNoteId(null)} onCopy={copy} />
        : view === 'manager' ? <LibraryManager onBusy={setWorking} notes={notes} busy={busy} dataPath={library.dataPath} onReload={library.reload} onBack={() => navigate('active')} />
        : selected ? <NoteDetail key={selected.id} note={selected} notes={notes} favorite={favorites.includes(selected.id)} busy={busy} desktop={isDesktop} onBack={back} onOpen={note => open(note, true)} onEdit={() => startEdit(selected)} onStar={() => star(selected)} onCopy={text => void copy(text)} onLink={openLink} onLifecycle={next => void lifecycle(selected, next)} onExport={() => void exportNote(selected)} />
        : appCommands.length ? <AppCommandList commands={appCommands} busy={busy} onRun={runAppCommand} /> : <>
          <div className="home-heading library-heading"><h1>{view === 'active' ? '노트' : view === 'archived' ? '보관함' : '휴지통'}</h1>{view === 'active' && <button className="add-button" title="새 노트 추가" disabled={busy} onClick={() => startEdit()}><Icon name="plus" /></button>}</div>
          <div className="library-filters"><select aria-label="도구 분류" value={category} onChange={event => setCategory(event.target.value)}><option value="">전체 도구</option>{[...new Set([...categories, ...notes.filter(note => note.lifecycle === view).map(note => note.category)])].map(value => <option key={value}>{value}</option>)}</select><select aria-label="항목 유형" value={type} onChange={event => setType(event.target.value)}><option value="">전체 유형</option>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><button className="text-button" onClick={() => { setQuery(''); setCategory(''); setType(''); setScope('all'); }}>초기화</button></div>
          {view === 'active' && <div className="scope-row feature-scope">{[['all', '전체'], ['favorites', '즐겨찾기'], ['recent', '최근 본 항목']].map(([key, label]) => <button className={scope === key ? 'scope active' : 'scope'} key={key} onClick={() => setScope(key)}>{label}</button>)}<span>{results.length}개</span></div>}
          {results.length ? <div className="note-list">{results.map(row)}</div> : <div className="empty-state"><h3>{query || category || type ? '일치하는 노트가 없어요' : '아직 노트가 없어요'}</h3><p>{view === 'active' ? '새 노트를 작성하거나 자료 관리에서 Markdown을 가져오세요.' : '이동한 노트는 이곳에서 확인하고 복구할 수 있습니다.'}</p></div>}
        </>}
      </div>
      <footer><span title={library.dataPath}><span className={`status-dot ${pinned ? 'on' : ''}`} />{busy ? '작업 중…' : isDesktop ? '내 PC에 파일로 저장 · 닫으면 트레이로' : '브라우저 미리보기 · 별도 저장'}</span>{isDesktop && <button className="text-button" onClick={() => { void window.commandNote!.openDataFolder().then(unwrap).catch(library.reportError); }}>저장 폴더</button>}</footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>}
  </main>;
}
