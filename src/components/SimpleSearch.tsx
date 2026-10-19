import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { Note } from '../../shared/library';
import type { AppCommand, AppCommandId } from '../../shared/app-commands';
import Icon from './Icon';
import AppIcon from './AppIcon';
import ToolIcon from './ToolIcon';
import './SimpleSearch.css';

interface Props {
  query: string;
  onQueryChange(value: string): void;
  results: Note[];
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  pinned: boolean;
  onOpen(note: Note): void;
  onCopy(note: Note): void;
  onExpand(): void;
  onTogglePin(): void;
  onHide(): void;
  error?: string;
  commands?: AppCommand[];
  onCommand?(id: AppCommandId): void;
}

export default function SimpleSearch({ query, onQueryChange, results, inputRef, busy, pinned, onOpen, onCopy, onExpand, onTogglePin, onHide, error, commands = [], onCommand }: Props) {
  const listId = useId();
  const helpId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const composing = useRef(false);
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const hasQuery = Boolean(query.trim());
  const optionIds = [...commands.map(command => `command-${command.id}`), ...results.map(note => note.id)];
  const resultKey = optionIds.join(',');
  const selectedIndex = Math.max(0, optionIds.indexOf(selectedId ?? ''));
  const selected = results[selectedIndex - commands.length];
  const selectedCommand = commands[selectedIndex];
  const selectedOptionId = optionIds[selectedIndex];

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);

  useEffect(() => {
    setSelectedId(optionIds[0] ?? null);
  }, [query, resultKey]);

  useEffect(() => {
    if (selectedOptionId) optionRefs.current.get(selectedOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedOptionId]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const searchKey = ['Escape', 'Enter', 'ArrowUp', 'ArrowDown'].includes(event.key);
    if (!searchKey) return;
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (query) onQueryChange('');
      else onHide();
      return;
    }
    if (event.target !== inputRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!optionIds.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedId(optionIds[(selectedIndex + direction + optionIds.length) % optionIds.length]);
    } else if (!busy) {
      if (selectedCommand) onCommand?.(selectedCommand.id);
      else if (selected) { if (event.ctrlKey || event.metaKey) onCopy(selected); else onOpen(selected); }
    }
  }

  return (
    <section className="panel simple-panel" aria-label="심플 모드" onKeyDown={handleKeyDown}>
      <div className="simple-drag-strip" aria-hidden={!error}>
        <span className="simple-grip" />
        {error && <span className="simple-error" role="alert" title={error}>확인 필요<span className="simple-sr-only">: {error}</span></span>}
      </div>
      <div className="simple-search-bar">
        <span className="simple-search-icon"><AppIcon size={30} /></span>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          role="combobox"
          aria-label="노트 검색"
          aria-autocomplete="list"
          aria-controls={hasQuery ? listId : undefined}
          aria-expanded={hasQuery}
          aria-activedescendant={hasQuery && selectedOptionId ? `${listId}-${selectedOptionId}` : undefined}
          aria-describedby={hasQuery ? helpId : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="노트 검색 · / 명령"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
        />
        <button type="button" className={`simple-control ${pinned ? 'pin-active' : ''}`} title={pinned ? '항상 위 고정 해제' : '항상 위에 고정'} aria-label="항상 위 고정" aria-pressed={pinned} onClick={onTogglePin}>
          <Icon name="pin" size={16} />
        </button>
        <button type="button" className="simple-control simple-expand" title="확장 모드 (Ctrl+Shift+M)" aria-label="확장 모드로 전환" onClick={onExpand} disabled={busy}>
          <Icon name="expand" size={16} />
        </button>
        <button type="button" className="simple-control simple-hide" title="창 숨기기 (Esc)" aria-label="창 숨기기" onClick={onHide}><Icon name="close" size={18} /></button>
      </div>
      {hasQuery && <>
        <div className="simple-results" id={listId} role="listbox" aria-label="검색 결과" aria-busy={busy}>
          {commands.map((command, index) => <div key={command.id} id={`${listId}-command-${command.id}`} ref={element => { if (element) optionRefs.current.set(`command-${command.id}`, element); else optionRefs.current.delete(`command-${command.id}`); }} className={`simple-result ${selectedIndex === index ? 'is-selected' : ''}`} role="option" aria-selected={selectedIndex === index} onMouseEnter={() => setSelectedId(`command-${command.id}`)}><button type="button" className="simple-open" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => onCommand?.(command.id)}><span className="simple-tool"><Icon name={command.id === 'hide' ? 'minus' : command.id === 'simple' ? 'search' : 'box'} size={23} /></span><span className="simple-note"><span className="simple-note-heading"><strong>{command.label}</strong><kbd>{command.command}</kbd></span><span className="simple-note-caption">{command.description}</span></span></button></div>)}
          {results.map((note, index) => <div
            key={note.id}
            id={`${listId}-${note.id}`}
            ref={element => { if (element) optionRefs.current.set(note.id, element); else optionRefs.current.delete(note.id); }}
            className={`simple-result ${selectedIndex === index + commands.length ? 'is-selected' : ''}`}
            role="option"
            aria-selected={selectedIndex === index + commands.length}
            onMouseEnter={() => setSelectedId(note.id)}
          >
            <button type="button" className="simple-open" aria-label={`${note.title} 열기`} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => onOpen(note)}>
              <span className="simple-tool"><ToolIcon category={note.category} type={note.type} size={25} /></span>
              <span className="simple-note">
                <span className="simple-note-heading"><strong>{note.title}</strong><span className="simple-category">{note.category}</span></span>
                <span className="simple-note-caption"><span className={note.command ? 'simple-command' : ''}>{note.command || note.description || ({ gui: '화면 조작', workflow: '작업 순서', troubleshooting: '오류 해결', command: '명령어' }[note.type])}</span><span className="simple-risk">{note.risk}</span></span>
              </span>
            </button>
            {note.command && <button type="button" className="simple-control simple-copy" aria-label={`${note.title} ${note.variables.length ? '값 입력 후 복사' : '명령 복사'}`} title={note.variables.length ? '값 입력 후 복사 (Ctrl + Enter)' : '명령 복사 (Ctrl + Enter)'} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => onCopy(note)}><Icon name="copy" size={16} /></button>}
          </div>)}
          {!results.length && !commands.length && <div className="simple-no-results" role="status">검색 결과가 없습니다.</div>}
        </div>
        <footer className="simple-shortcuts" id={helpId}>
          <span><kbd>↑↓</kbd> 이동</span>
          <span><kbd>Enter</kbd> 열기</span>
          {!commands.length && <span><kbd>Ctrl + Enter</kbd> 복사</span>}
          <span><kbd>Esc</kbd> 지우기</span>
        </footer>
      </>}
    </section>
  );
}
