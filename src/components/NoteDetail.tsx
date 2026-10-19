import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fillCommand } from '../../shared/commands';
import type { Note } from '../../shared/library';
import { typeLabels } from './NoteEditor';
import ToolIcon from './ToolIcon';

interface Props {
  note: Note;
  notes: Note[];
  favorite: boolean;
  busy: boolean;
  desktop: boolean;
  onBack(): void;
  onOpen(note: Note): void;
  onEdit(): void;
  onStar(): void;
  onCopy(text: string): void;
  onLink(url: string): void;
  onLifecycle(value: Note['lifecycle']): void;
  onExport(): void;
}
export default function NoteDetail({ note, notes, favorite, busy, desktop, onBack, onOpen, onEdit, onStar, onCopy, onLink, onLifecycle, onExport }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  let prepared = note.command;
  let preparationError = '';
  try { prepared = fillCommand(note, values); } catch (error) { preparationError = error instanceof Error ? error.message : '변수 값을 확인해 주세요.'; }
  const workflows = notes.filter(item => item.lifecycle === 'active' && item.type === 'workflow' && item.steps.some(step => step.noteId === note.id));
  return <article className="detail feature-detail">
    <div className="detail-nav"><button className="text-button" onClick={onBack}>← 돌아가기</button><div className="action-row">
      <button className="text-button" disabled={busy} onClick={onStar}>{favorite ? '★ 즐겨찾기' : '☆ 즐겨찾기'}</button>
      {note.lifecycle === 'active' && <button className="text-button" disabled={busy} onClick={onEdit}>편집</button>}
    </div></div>
    <div className="breadcrumb tool-breadcrumb"><ToolIcon category={note.category} type={note.type} size={20} />{note.category} / {typeLabels[note.type]}{note.tag && ` / ${note.tag}`}</div>
    <h1>{note.title}</h1>
    <div className="environment"><span className={`risk risk-${note.risk === '삭제' ? 'delete' : note.risk === '변경' ? 'write' : 'read'}`}>{note.risk}</span><span>{note.shell === 'unknown' ? note.environment : note.shell}</span><span>{note.location}</span></div>
    {note.environment && <p className="muted">환경 상세 · {note.environment}</p>}
    {note.lifecycle !== 'active' && <div className="lifecycle-notice"><span>{note.lifecycle === 'archived' ? '보관함에 있는 노트입니다.' : '휴지통에 있는 노트입니다.'}</span><button className="secondary-button" disabled={busy} onClick={() => onLifecycle('active')}>복구</button></div>}
    <div className="markdown-body"><ReactMarkdown skipHtml components={{ a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} onClick={event => { event.preventDefault(); onLink(href); }}>{children}</a> : <span>{children}</span> }}>{note.description}</ReactMarkdown></div>
    {note.type === 'workflow' ? <div className="workflow-steps">{note.steps.map((step, index) => {
      const linked = notes.find(item => item.id === step.noteId);
      return <section className="detail-section workflow-step" key={step.id}>
        <h3><span className="step-number">{index + 1}</span>{step.title}</h3>
        {step.instruction && <p className="prewrap">{step.instruction}</p>}
        {step.noteId && (linked ? <button className="linked-card" onClick={() => onOpen(linked)}><ToolIcon category={linked.category} type={linked.type} /><span className="linked-card-label"><strong>{linked.title}</strong><small>{linked.shell} · {linked.risk} · {linked.location}{linked.lifecycle !== 'active' && ` · ${linked.lifecycle === 'archived' ? '보관됨' : '휴지통'}`}</small></span><span>카드 열기 ↗</span></button> : <p className="inline-error">연결된 카드가 없습니다. 작업 순서를 편집해 연결을 확인해 주세요.</p>)}
        {(step.expectedResult || linked?.expectedResult) && <div className="step-result"><strong>확인할 결과</strong><p className="prewrap">{step.expectedResult || linked?.expectedResult}</p></div>}
        {step.nextAction && <div className="step-result"><strong>다음 행동</strong><p className="prewrap">{step.nextAction}</p></div>}
      </section>;
    })}</div> : <>
      {note.variables.length > 0 && <section className="detail-section variable-values"><h3>이번 작업에 사용할 값</h3><p className="muted">입력값은 파일에 저장하지 않습니다.</p>{note.variables.map(variable => <label key={variable.name}>{variable.label || variable.name}{variable.required && ' *'}<input autoComplete="off" value={values[variable.name] ?? ''} onChange={event => setValues(old => ({ ...old, [variable.name]: event.target.value }))} placeholder={variable.name} /></label>)}</section>}
      {note.command && <section className="detail-section"><h3>{note.type === 'gui' ? '메뉴 경로·입력값' : '명령'}</h3><div className="code-block"><code>{preparationError ? note.command : prepared}</code><button className="copy-command" disabled={!!preparationError} onClick={() => onCopy(prepared)}>복사</button></div>{preparationError && <p className="inline-error" role="status">{preparationError}</p>}{note.variables.length > 0 && <details><summary>저장된 템플릿 보기</summary><pre className="template-preview">{note.command}</pre></details>}</section>}
    </>}
    {note.optionsText && <section className="detail-section"><h3>옵션 의미</h3><p className="prewrap">{note.optionsText}</p></section>}
    <section className="detail-section"><h3>결과 읽는 법</h3><p className="prewrap">{note.expectedResult || '아직 기록되지 않았습니다. 편집에서 출력의 확인 항목을 추가해 주세요.'}</p></section>
    {(note.caution || ['변경', '삭제'].includes(note.risk)) && <div className="caution"><strong>{note.risk} 작업 확인</strong><p className="prewrap">{note.caution || '대상과 실행 위치를 확인하고 필요한 파일은 먼저 백업하세요.'}</p></div>}
    {workflows.length > 0 && <section className="detail-section"><h3>이 카드를 사용하는 작업</h3>{workflows.map(workflow => <button className="linked-card" key={workflow.id} onClick={() => onOpen(workflow)}>{workflow.title}<span>↗</span></button>)}</section>}
    <div className="note-management action-row">
      {desktop && <button className="secondary-button" disabled={busy} onClick={onExport}>Markdown 내보내기</button>}
      {note.lifecycle === 'active' && <button className="secondary-button" disabled={busy} onClick={() => onLifecycle('archived')}>보관</button>}
      {note.lifecycle !== 'deleted' && <button className="secondary-button danger-text" disabled={busy} onClick={() => onLifecycle('deleted')}>휴지통으로</button>}
    </div>
    <p className="last-checked">수정 {new Date(note.updatedAt).toLocaleString('ko-KR')} · 실행 확인 기록 없음</p>
  </article>;
}
