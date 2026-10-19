import { useEffect, useState } from 'react';
import { noteSchema, type Note } from '../../shared/library';
import { detectCommandVariables } from '../../shared/commands';
import ToolIcon, { toolCategories } from './ToolIcon';

export const typeLabels = { command: '명령어', gui: '화면 조작', workflow: '작업 순서', troubleshooting: '오류 해결' };
interface Props {
  note: Note;
  notes: Note[];
  onSave(note: Note): Promise<void>;
  onCancel(): void;
  onDirty(value: boolean): void;
}
export default function NoteEditor({ note, notes, onSave, onCancel, onDirty }: Props) {
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [variableNotice, setVariableNotice] = useState('');
  useEffect(() => { onDirty(JSON.stringify(draft) !== JSON.stringify(note)); }, [draft, note, onDirty]);
  const update = <K extends keyof Note>(key: K, value: Note[K]) => setDraft(old => ({ ...old, [key]: value }));
  const cards = notes.filter(item => item.id !== note.id && item.type !== 'workflow' && item.lifecycle === 'active');
  const stepChange = (index: number, patch: Partial<Note['steps'][number]>) => update('steps', draft.steps.map((step, i) => i === index ? { ...step, ...patch } : step));
  const move = (index: number, by: number) => {
    const steps = [...draft.steps];
    [steps[index], steps[index + by]] = [steps[index + by], steps[index]];
    update('steps', steps);
  };
  return <form className="editor feature-editor" onSubmit={async event => {
    event.preventDefault();
    const parsed = noteSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setSaving(true); setError('');
    try { await onSave(parsed.data); } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다.'); } finally { setSaving(false); }
  }}>
    <div className="detail-nav"><button className="text-button" type="button" disabled={saving} onClick={onCancel}>← 취소</button><span>{note.title ? '노트 편집' : '새 노트'}</span></div>
    <h2>다음 작업을 위한 기록</h2><p className="muted">목적과 실행 환경, 확인할 결과를 함께 남겨 주세요.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <fieldset disabled={saving}>
      <label>하려는 일<input required value={draft.title} onChange={event => update('title', event.target.value)} placeholder="예: 컨테이너의 양식 파일 위치 확인" /></label>
      <div className="field-grid"><label>항목 유형<select value={draft.type} onChange={event => { const type = event.target.value as Note['type']; setDraft(old => ({ ...old, type, shell: type === 'gui' ? 'gui' : old.shell })); }}>{Object.entries(typeLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>도구·분류<span className="tool-category-input"><ToolIcon category={draft.category} type={draft.type} /><input required list="note-categories" value={draft.category} onChange={event => update('category', event.target.value)} /></span><datalist id="note-categories">{[...new Set([...toolCategories, '프로젝트·기타', ...notes.map(item => item.category)])].map(category => <option key={category}>{category}</option>)}</datalist></label></div>
      <label>태그<input value={draft.tag} onChange={event => update('tag', event.target.value)} placeholder="조회, 파일, 접속 등" /></label>
      <div className="field-grid"><label>셸·조작 환경<select value={draft.shell} onChange={event => update('shell', event.target.value as Note['shell'])}><option value="powershell">PowerShell</option><option value="bash">Bash</option><option value="gui">GUI</option><option value="unknown">미확인</option></select></label>
      <label>작업 영향<select value={draft.risk} onChange={event => update('risk', event.target.value)}>{['미확인', '조회', '변경', '삭제', '접속'].map(value => <option key={value}>{value}</option>)}{!['미확인', '조회', '변경', '삭제', '접속'].includes(draft.risk) && <option>{draft.risk}</option>}</select></label></div>
      <label>실행 환경 상세<input value={draft.environment} onChange={event => update('environment', event.target.value)} placeholder="예: Windows 11 · PowerShell 7" /></label>
      <label>입력 위치와 대상<input value={draft.location} onChange={event => update('location', event.target.value)} placeholder="예: SSH 서버 · 개발 / 컨테이너 내부" /></label>
      <label>목적·설명 <span className="muted">Markdown 지원</span><textarea rows={5} value={draft.description} onChange={event => update('description', event.target.value)} /></label>
      {draft.type !== 'workflow' && <>
        <label>{draft.type === 'gui' ? '메뉴 경로·입력값' : '명령 또는 확인 방법'}<textarea className="mono" rows={3} required={draft.type === 'command'} value={draft.command} onChange={event => update('command', event.target.value)} placeholder="docker inspect {{container}}" /></label>
        <div className="subheading"><h3>바꿔 넣을 값</h3><div className="action-row"><button type="button" className="text-button" onClick={() => {
          const names = detectCommandVariables(draft.command);
          const missing = names.filter(name => !draft.variables.some(variable => variable.name === name));
          if (draft.variables.length + missing.length > 30) { setVariableNotice('변수는 최대 30개까지 등록할 수 있습니다.'); return; }
          if (missing.length) update('variables', [...draft.variables, ...missing.map(name => ({ name, label: '', required: true }))]);
          setVariableNotice(missing.length ? `${missing.length}개 변수를 추가했습니다. 아래에서 설명과 필수 여부를 정해 주세요.` : names.length ? '명령의 변수가 모두 등록되어 있습니다.' : '명령에 {{container}} 또는 {{branch}}처럼 바꿔 넣을 값을 작성해 주세요.');
        }}>명령에서 변수 가져오기</button><button type="button" className="text-button" disabled={draft.variables.length >= 30} onClick={() => {
          let number = draft.variables.length + 1;
          while (draft.variables.some(variable => variable.name === `value${number}`)) number++;
          update('variables', [...draft.variables, { name: `value${number}`, label: '', required: true }]);
        }}>+ 변수 추가</button></div></div>
        <p className="muted">예: <code>{'docker inspect {{container}}'}</code> · <code>{'git checkout {{branch}}'}</code><br />명령에 변수를 작성한 뒤 가져오기를 누르면 입력 항목을 만들 수 있습니다. 셸 변수는 따옴표 없이 독립된 인수로 둡니다.</p>
        {variableNotice && <p className="muted" role="status">{variableNotice}</p>}
        {draft.variables.map((variable, index) => <div className="variable-editor" key={index}>
          <label>변수 이름<input required value={variable.name} pattern="[A-Za-z_][A-Za-z0-9_]*" onChange={event => update('variables', draft.variables.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
          <label>설명<input value={variable.label} onChange={event => update('variables', draft.variables.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /></label>
          <label className="check-label"><input type="checkbox" checked={variable.required} onChange={event => update('variables', draft.variables.map((item, i) => i === index ? { ...item, required: event.target.checked } : item))} />필수</label>
          <button type="button" className="text-button danger-text" onClick={() => update('variables', draft.variables.filter((_, i) => i !== index))}>제거</button>
        </div>)}
      </>}
      {draft.type === 'workflow' && <>
        <div className="subheading"><h3>작업 단계</h3><button type="button" className="text-button" onClick={() => update('steps', [...draft.steps, { id: crypto.randomUUID(), title: '새 단계', instruction: '', expectedResult: '', nextAction: '' }])}>+ 단계 추가</button></div>
        {draft.steps.map((step, index) => <section className="step-editor" key={step.id}>
          <div className="subheading"><strong>{index + 1}단계</strong><div><button type="button" className="text-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${index + 1}단계 위로`}>↑</button><button type="button" className="text-button" disabled={index === draft.steps.length - 1} onClick={() => move(index, 1)} aria-label={`${index + 1}단계 아래로`}>↓</button><button type="button" className="text-button danger-text" onClick={() => update('steps', draft.steps.filter((_, i) => i !== index))}>제거</button></div></div>
          <label>단계 제목<input required value={step.title} onChange={event => stepChange(index, { title: event.target.value })} /></label>
          <label>연결할 카드<select value={step.noteId ?? ''} onChange={event => { const id = event.target.value; const linked = cards.find(item => item.id === id); stepChange(index, { noteId: id || undefined, title: step.title === '새 단계' && linked ? linked.title : step.title }); }}><option value="">설명만 작성</option>{step.noteId && !cards.some(item => item.id === step.noteId) && <option value={step.noteId}>기존 연결 유지 · 보관되었거나 누락된 카드</option>}{cards.map(card => <option key={card.id} value={card.id}>{card.category} · {card.title}</option>)}</select></label>
          <label>단계 설명<textarea value={step.instruction} onChange={event => stepChange(index, { instruction: event.target.value })} /></label>
          <label>확인할 결과<textarea value={step.expectedResult} onChange={event => stepChange(index, { expectedResult: event.target.value })} /></label>
          <label>결과에 따른 다음 행동<textarea value={step.nextAction} onChange={event => stepChange(index, { nextAction: event.target.value })} /></label>
        </section>)}
      </>}
      <label>옵션 의미<textarea value={draft.optionsText} onChange={event => update('optionsText', event.target.value)} placeholder="내가 사용하는 옵션만 설명해 주세요." /></label>
      <label>결과 읽는 법<textarea value={draft.expectedResult} onChange={event => update('expectedResult', event.target.value)} placeholder="출력에서 볼 항목과 정상 결과를 기록하세요." /></label>
      <label>주의점<textarea value={draft.caution} onChange={event => update('caution', event.target.value)} /></label>
      <button className="primary-button" type="submit">{saving ? '저장 중…' : '노트 저장'}</button>
    </fieldset>
  </form>;
}
