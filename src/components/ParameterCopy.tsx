import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { detectCommandVariables, fillCommand } from '../../shared/commands';
import type { Note } from '../../shared/library';
import ToolIcon from './ToolIcon';
import './ParameterCopy.css';

interface Props {
  note: Note;
  compact: boolean;
  onClose(): void;
  onCopy(text: string): Promise<boolean>;
}

export function parameterCopyHeight(variableCount: number): number {
  return Math.min(640, 280 + 80 * Math.min(variableCount, 4));
}

export default function ParameterCopy({ note, compact, onClose, onCopy }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const composing = useRef(false);
  const imeSubmitBlocked = useRef(false);
  const busy = useRef(false);
  const id = useId();
  const missingDefinitions = detectCommandVariables(note.command).filter(name => !note.variables.some(variable => variable.name === name));
  let prepared = '';
  let validationError = '';
  try {
    prepared = fillCommand(note, values);
  } catch (error) {
    validationError = error instanceof Error ? error.message : '입력값과 명령 템플릿을 확인해 주세요.';
  }
  if (missingDefinitions.length) validationError = `등록되지 않은 변수: ${missingDefinitions.join(', ')}. 노트 편집에서 ‘명령에서 변수 가져오기’를 눌러 주세요.`;
  if (!note.command.trim()) validationError = '복사할 명령이 없습니다. 노트 편집에서 명령을 작성해 주세요.';

  useEffect(() => {
    setValues({});
    setCopyError('');
    composing.current = false;
    imeSubmitBlocked.current = false;
    const inputs = formRef.current?.querySelectorAll<HTMLInputElement>('input');
    const firstRequired = [...(inputs ?? [])].find(input => input.required);
    const firstInput = firstRequired ?? inputs?.[0];
    firstInput?.focus({ preventScroll: true });
    firstInput?.scrollIntoView({ block: 'nearest' });
  }, [note.id]);

  async function copyPrepared() {
    if (busy.current || validationError || composing.current || imeSubmitBlocked.current) return;
    busy.current = true;
    setCopying(true);
    setCopyError('');
    try {
      if (await onCopy(prepared)) onClose();
      else setCopyError('복사하지 못했습니다. 입력값을 유지했으니 다시 시도해 주세요.');
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : '복사하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setCopying(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const inComposition = composing.current || event.nativeEvent.isComposing || event.keyCode === 229;
    if (!inComposition) imeSubmitBlocked.current = false;
    if (event.key !== 'Escape' && event.key !== 'Enter') return;
    event.stopPropagation();
    if (inComposition) {
      imeSubmitBlocked.current = true;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy.current) onClose();
    } else if (event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void copyPrepared();
    }
  }

  const content = <>
    {compact && <div className="parameter-drag-strip" aria-hidden="true"><span /></div>}
    <div className="parameter-header">
      <button type="button" className="text-button parameter-back" disabled={copying} onClick={onClose} aria-label="값 입력 닫고 돌아가기">← 돌아가기</button>
      <span>값 입력 후 복사</span>
      <kbd>Esc</kbd>
    </div>
    <form ref={formRef} className="parameter-form" noValidate onPointerDownCapture={() => { if (!composing.current) imeSubmitBlocked.current = false; }} onSubmit={event => { event.preventDefault(); void copyPrepared(); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
      <div className="parameter-fields">
        <div className="parameter-note-heading"><ToolIcon category={note.category} type={note.type} size={24} /><div><h2>{note.title}</h2><p>{note.shell === 'unknown' ? '실행 환경 미확인' : note.shell} · {note.risk}{note.location && ` · ${note.location}`}</p></div></div>
        <p className="parameter-help" id={`${id}-help`}>이번에 사용할 값을 입력하세요. 입력값은 저장하지 않습니다.</p>
        {note.variables.map((variable, index) => <label className="parameter-field" key={variable.name} htmlFor={`${id}-${index}`}>
          <span>{variable.label || variable.name}<small>{variable.required ? '필수' : '선택'}</small></span>
          <input id={`${id}-${index}`} type="text" name={variable.name} required={variable.required} disabled={copying} value={values[variable.name] ?? ''} placeholder={variable.name} aria-describedby={`${id}-help ${id}-validation`} autoComplete="off" spellCheck={false} onChange={event => { setValues(old => ({ ...old, [variable.name]: event.target.value })); setCopyError(''); }} />
          {variable.label && <code className="parameter-variable-name">{`{{${variable.name}}}`}</code>}
        </label>)}
        {!note.variables.length && <p className="parameter-help">입력 항목이 없습니다. 노트 편집에서 {'{{container}}'}처럼 변수를 작성하고 ‘명령에서 변수 가져오기’를 눌러 주세요.</p>}
        {note.caution && <p className="parameter-caution">{note.caution}</p>}
      </div>
      <div className="parameter-copy-area">
        <div className="parameter-preview-label"><strong>{validationError ? '명령 템플릿' : '완성된 명령'}</strong><span>{note.shell === 'gui' ? '입력값을 반영합니다' : '각 값을 셸에 맞게 따옴표로 감쌉니다'}</span></div>
        <pre className="parameter-preview"><code>{validationError ? note.command : prepared}</code></pre>
        <p className={`parameter-validation ${validationError ? 'has-error' : ''}`} id={`${id}-validation`} role="status">{validationError || 'Enter를 누르면 완성된 명령이 복사됩니다.'}</p>
        {copyError && <p className="parameter-copy-error" role="alert">{copyError}</p>}
        <button className="primary-button parameter-submit" type="submit" disabled={copying || !!validationError}>{copying ? '복사 중…' : '완성된 명령 복사'}<kbd>Enter</kbd></button>
      </div>
    </form>
  </>;

  return compact
    ? <section className="panel parameter-panel" aria-label="명령 변수 입력" onKeyDown={handleKeyDown}>{content}</section>
    : <article className="parameter-copy" aria-label="명령 변수 입력" onKeyDown={handleKeyDown}>{content}</article>;
}
