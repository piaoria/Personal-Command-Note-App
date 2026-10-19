import { useEffect, useState } from 'react';
import { unwrap, type Note, type BackupPreview, type ShortcutState } from '../../shared/library';
import { isDesktop } from '../storage/repository';

interface Props { notes: Note[]; dataPath: string; busy: boolean; onReload(): Promise<void>; onBack(): void; onBusy(value: boolean): void; }
export default function LibraryManager({ notes, dataPath, busy, onReload, onBack, onBusy }: Props) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [shortcut, setShortcut] = useState('Ctrl+Alt+K');
  const [modeShortcut, setModeShortcut] = useState('Ctrl+Alt+M');
  const [shortcutState, setShortcutState] = useState<ShortcutState | null>(null);
  const [loadingShortcuts, setLoadingShortcuts] = useState(isDesktop);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    void window.commandNote!.getShortcut().then(unwrap).then(value => {
      if (!active) return;
      setShortcutState(value);
      setShortcut(value.accelerator);
      setModeShortcut(value.toggleAccelerator);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : '단축키 설정을 읽지 못했습니다.');
    }).finally(() => { if (active) setLoadingShortcuts(false); });
    return () => { active = false; };
  }, []);
  const run = async (action: () => Promise<void>) => { setWorking(true); onBusy(true); setError(''); setMessage(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : '작업을 완료하지 못했습니다.'); } finally { setWorking(false); onBusy(false); } };
  const disabled = working || busy || !isDesktop;
  const saveShortcut = (kind: 'search' | 'mode') => void run(async () => {
    const submitted = (kind === 'search' ? shortcut : modeShortcut).trim();
    const value = unwrap(await (kind === 'search' ? window.commandNote!.setShortcut(submitted) : window.commandNote!.setModeShortcut(submitted)));
    setShortcutState(value);
    // Saving either binding must not erase an unsaved edit in the other field.
    if (kind === 'search') setShortcut(current => current.trim() === submitted ? value.accelerator : current);
    else setModeShortcut(current => current.trim() === submitted ? value.toggleAccelerator : current);
    const registered = kind === 'search' ? value.registered : value.toggleRegistered;
    setMessage(`${kind === 'search' ? '창 열기·숨기기' : '모드 전환'} 단축키를 ${registered ? '적용' : '해제'}했습니다.`);
  });
  const shortcutStatus = (accelerator: string | undefined, registered: boolean | undefined, draft: string) => {
    if (!isDesktop) return 'Windows 앱에서 설정할 수 있습니다.';
    if (loadingShortcuts) return '단축키 설정을 읽는 중입니다.';
    if (accelerator === undefined) return '현재 등록 상태를 확인하지 못했습니다. 저장해 다시 등록할 수 있습니다.';
    const status = accelerator ? (registered ? `사용 중: ${accelerator}` : `등록되지 않음: ${accelerator} · 다른 조합으로 저장해 주세요.`) : '단축키가 해제되어 있습니다.';
    return `${status}${draft.trim() !== accelerator ? ' · 입력한 변경 사항은 아직 저장되지 않았습니다.' : ''}`;
  };
  return <article className="detail manager">
    <div className="detail-nav"><button className="text-button" onClick={onBack}>← 노트로</button><span>자료 관리</span></div><h1>백업과 자료 이동</h1>
    {message && <p className="operation-message" role="status">{message}</p>}{error && <p className="inline-error" role="alert">{error}</p>}
    {!isDesktop && <p className="operation-message">파일 대화상자와 트레이 설정은 Windows 앱에서 사용할 수 있습니다.</p>}
    <section className="detail-section"><h3>Markdown</h3><p>일반 Markdown과 커맨드 노트 문서를 가져옵니다. ID가 겹치면 연결 관계를 유지한 사본을 추가합니다.</p><div className="action-row">
      <button disabled={disabled} className="secondary-button" onClick={() => void run(async () => { const result = unwrap(await window.commandNote!.importMarkdown()); if (!result.canceled) { await onReload(); setMessage(`${result.count}개 문서를 가져왔습니다.`); } })}>가져오기</button>
      <button disabled={disabled || !notes.some(note => note.lifecycle === 'active')} className="secondary-button" onClick={() => void run(async () => { const result = unwrap(await window.commandNote!.exportMarkdown(notes.filter(note => note.lifecycle === 'active').map(note => note.id))); if (!result.canceled) setMessage(`${result.count}개 Markdown 파일을 내보냈습니다.`); })}>사용 중인 노트 내보내기</button>
    </div></section>
    <section className="detail-section"><h3>전체 백업과 복원</h3><p>사용 중인 노트, 보관함, 휴지통, 카드 연결과 즐겨찾기·최근 기록을 ZIP 하나로 보관합니다.</p><div className="action-row">
      <button disabled={disabled} className="secondary-button" onClick={() => void run(async () => { if (unwrap(await window.commandNote!.exportBackup())) setMessage('ZIP 백업을 저장했습니다.'); })}>ZIP 백업 저장</button>
      <button disabled={disabled} className="secondary-button" onClick={() => void run(async () => { setPreview(unwrap(await window.commandNote!.inspectBackup())); })}>복원할 백업 선택</button>
    </div>
    {preview && <div className="restore-review"><strong>복원 내용 확인</strong><p>전체 {preview.notes}개 · 보관 {preview.archived}개 · 휴지통 {preview.deleted}개</p><p>현재 자료 전체를 이 백업으로 교체합니다. 복원 전 자료는 앱 데이터 폴더의 vault-before-restore 폴더에 보존합니다. 창·단축키 설정은 유지합니다.</p><div className="action-row"><button disabled={disabled} className="secondary-button danger-text" onClick={() => void run(async () => { if (!window.confirm('현재 노트를 선택한 백업으로 교체할까요? 복원 전 자료는 별도로 보존됩니다.')) return; unwrap(await window.commandNote!.restoreBackup(preview.token)); setPreview(null); await onReload(); setMessage('백업을 복원했습니다.'); })}>이 백업으로 전체 복원</button><button disabled={working} className="text-button" onClick={() => setPreview(null)}>취소</button></div></div>}
    </section>
    <section className="detail-section"><h3>트레이와 전역 단축키</h3>
      <p>{shortcutState?.trayAvailable !== false ? '창을 닫으면 트레이에 남습니다. 트레이에서 열거나 완전 종료할 수 있습니다.' : '현재 환경에서 트레이를 만들지 못했습니다. 창을 닫으면 앱이 종료됩니다.'}</p>
      <p>CommandNote가 트레이에서 실행 중이면 Windows의 다른 앱을 사용하는 동안에도 아래 단축키를 사용할 수 있습니다. 앱을 완전 종료하면 단축키도 꺼집니다.</p>
      <label>창 열기·숨기기<input value={shortcut} onChange={event => setShortcut(event.target.value)} placeholder="Ctrl+Alt+K" disabled={disabled || loadingShortcuts} /></label>
      <button disabled={disabled || loadingShortcuts} className="secondary-button" onClick={() => saveShortcut('search')}>창 열기·숨기기 단축키 저장</button>
      <p className={shortcutState?.accelerator && !shortcutState.registered ? 'inline-error' : 'muted'} role="status">{shortcutStatus(shortcutState?.accelerator, shortcutState?.registered, shortcut)}</p>
      <label>심플·확장 모드 전환<input value={modeShortcut} onChange={event => setModeShortcut(event.target.value)} placeholder="Ctrl+Alt+M" disabled={disabled || loadingShortcuts} /></label>
      <button disabled={disabled || loadingShortcuts} className="secondary-button" onClick={() => saveShortcut('mode')}>모드 전환 단축키 저장</button>
      <p className={shortcutState?.toggleAccelerator && !shortcutState.toggleRegistered ? 'inline-error' : 'muted'} role="status">{shortcutStatus(shortcutState?.toggleAccelerator, shortcutState?.toggleRegistered, modeShortcut)}</p>
      <p className="muted">예: Ctrl+Alt+K / Ctrl+Shift+Space. 각 입력을 비우고 저장하면 해당 단축키가 해제됩니다. 다른 앱이나 단축키와 겹치면 기존 설정을 유지합니다.</p>
      <p className="muted">앱 안에서는 <kbd>Ctrl+K</kbd>로 검색하고, <kbd>Ctrl+Shift+M</kbd>으로 심플·확장 모드를 전환할 수 있습니다.</p>
    </section>
    <section className="detail-section"><h3>저장 위치</h3><p className="prewrap mono">{dataPath}</p><div className="action-row"><button disabled={disabled} className="secondary-button" onClick={() => void run(async () => { unwrap(await window.commandNote!.openDataFolder()); })}>저장 폴더 열기</button><button disabled={disabled} className="secondary-button" onClick={() => { void window.commandNote!.quit(); }}>앱 완전 종료</button></div></section>
  </article>;
}
