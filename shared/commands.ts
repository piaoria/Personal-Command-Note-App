import { LibraryError, type Note } from './library';

export function detectCommandVariables(command: string): string[] {
  return [...new Set([...command.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)].map(match => match[1]))];
}

export function fillCommand(note: Note, values: Record<string, string>): string {
  const placeholders = [...note.command.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)];
  const residual = note.command.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, '').replace(/\{\{[^{}]*[.\s][^{}]*\}\}/g, '');
  if (residual.includes('{{')) throw new LibraryError('VALIDATION_ERROR', '변수 표기를 확인해 주세요. 예: {{container}}');
  if (!note.variables.length && !placeholders.length) return note.command;
  if (!['powershell', 'bash', 'gui'].includes(note.shell)) throw new LibraryError('VALIDATION_ERROR', '변수 복사 전에 PowerShell 또는 Bash 실행 환경을 선택해 주세요.');
  for (const variable of note.variables) {
    if (!placeholders.some(match => match[1] === variable.name)) throw new LibraryError('VALIDATION_ERROR', `${variable.name} 변수가 명령에 없습니다.`);
  }
  return note.command.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (match, name: string, offset: number) => {
    const variable = note.variables.find(item => item.name === name);
    if (!variable) throw new LibraryError('VALIDATION_ERROR', `${name} 변수가 등록되지 않았습니다.`);
    const value = values[name] ?? '';
    if (variable.required && !value.trim()) throw new LibraryError('VALIDATION_ERROR', `${variable.label || name} 값을 입력해 주세요.`);
    if (/[\r\n\u0000]/.test(value)) throw new LibraryError('VALIDATION_ERROR', '변수 값에는 줄바꿈을 사용할 수 없습니다.');
    if (note.shell === 'gui') return value;
    let quote = '';
    for (let index = 0; index < offset; index++) {
      const char = note.command[index];
      const escape = note.shell === 'powershell' ? '`' : '\\';
      if (char === escape && quote !== "'") { index++; continue; }
      if (quote === "'" && note.shell === 'powershell' && char === "'" && note.command[index + 1] === "'") { index++; continue; }
      if (char === quote) quote = '';
      else if (!quote && (char === "'" || char === '"')) quote = char;
    }
    if (quote) throw new LibraryError('VALIDATION_ERROR', '{{변수}}를 감싸는 따옴표를 제거해 주세요.');
    const before = note.command.slice(0, offset).slice(-1);
    const after = note.command[offset + match.length];
    if ((before && !/[\s=]/.test(before)) || (after && !/\s/.test(after))) throw new LibraryError('VALIDATION_ERROR', '{{변수}}는 따옴표 없이 독립된 인수로 작성해 주세요.');
    return note.shell === 'powershell' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\"'\"'")}'`;
  });
}
