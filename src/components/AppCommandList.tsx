import type { AppCommand, AppCommandId } from '../../shared/app-commands';
import Icon from './Icon';

export default function AppCommandList({ commands, busy, onRun }: { commands: AppCommand[]; busy: boolean; onRun(id: AppCommandId): void }) {
  return <section className="app-command-list" aria-label="앱 명령"><h2>앱 명령</h2>{commands.map(command => <button key={command.id} disabled={busy} onClick={() => onRun(command.id)}><Icon name={command.id === 'hide' ? 'minus' : command.id === 'simple' ? 'search' : 'box'} size={21} /><span><strong>{command.label}</strong><small>{command.description}</small></span><kbd>{command.command}</kbd></button>)}</section>;
}
