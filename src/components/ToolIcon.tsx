import type { CSSProperties, ReactNode } from 'react';
import type { Note } from '../../shared/library';
import Icon from './Icon';

// Small, locally drawn SVGs inspired by each tool's identifying silhouette.
// All colors flow through CSS so dark mode can use a single gray palette.
const tools = [
  { id: 'docker', label: 'Docker', color: '#2496ed', names: ['docker', '도커'] },
  { id: 'git', label: 'Git', color: '#f05032', names: ['git', '깃'] },
  { id: 'github', label: 'GitHub', color: '#24292f', names: ['github', '깃허브'] },
  { id: 'compass', label: 'MongoDB Compass', color: '#00a35c', names: ['mongodbcompass', 'compass', '몽고db컴퍼스'] },
  { id: 'mongodb', label: 'MongoDB', color: '#00a35c', names: ['mongodb', '몽고db'] },
  { id: 'mobaxterm', label: 'MobaXterm', color: '#269e65', names: ['mobaxterm', '모바엑스텀'] },
  { id: 'powershell', label: 'PowerShell', color: '#2671be', names: ['powershell', 'pwsh', '파워셸', '파워쉘'] },
  { id: 'bash', label: 'Bash', color: '#3e474a', names: ['bash', 'gnubash', '배시', '배쉬'] },
  { id: 'workbench', label: 'NoSQL Workbench', color: '#7952c5', names: ['nosqlworkbench', 'dynamodb', 'amazondynamodb', 'awsdynamodb'] },
  { id: 'vscode', label: 'VS Code', color: '#23a8f2', names: ['vscode', 'visualstudiocode'] },
] as const;

export const toolCategories = tools.map(tool => tool.label);
const leaf = <><path d="M16 2c-1 4-10 8-10 16 0 5 4.2 8 10 11 5.8-3 10-6 10-11C26 10 17 6 16 2Z" /><path d="M16 8v22" fill="none" stroke="var(--tool-cutout)" strokeWidth="1.4" opacity=".65" /></>;
const cutout = 'var(--tool-cutout)';
const shapes: Record<(typeof tools)[number]['id'], ReactNode> = {
  docker: <>
    <path d="M2 17h19c2.1 0 3.4-.6 4.1-1.7-1.2-.9-1.8-2.3-1.6-4 1.8.3 3.1 1.2 3.8 2.6 1.2-.6 2.5-.7 3.7-.2-.7 2-2.2 3.4-4.5 3.9C24.8 24 20.8 28 12.3 28 5.8 28 2.2 24.6 2 17Z" />
    <path d="M3 12h4v4H3zm5 0h4v4H8zm5 0h4v4h-4zm5 0h4v4h-4zM8 7h4v4H8zm5 0h4v4h-4zm5 0h4v4h-4zm-5-5h4v4h-4z" />
    <circle cx="7" cy="20.5" r="1" fill={cutout} />
  </>,
  git: <>
    <rect x="5" y="5" width="22" height="22" rx="2.3" transform="rotate(45 16 16)" />
    <path d="m10 7 12 12M15 12v12" fill="none" stroke={cutout} strokeWidth="2.2" />
    <g fill={cutout}><circle cx="15" cy="12" r="2.6" /><circle cx="22" cy="19" r="2.6" /><circle cx="15" cy="24" r="2.6" /></g>
  </>,
  github: <>
    <path d="M16 2a14 14 0 0 0-4.4 27.3V26c-3.7.8-4.6-1.6-4.6-1.6-.6-1.6-1.5-2-1.5-2-1.2-.8.1-.8.1-.8 1.3.1 2 1.3 2 1.3 1.2 2 3.1 1.4 4 1.1.1-.9.5-1.5.9-1.9-3-.3-6.1-1.5-6.1-6.4 0-1.4.5-2.6 1.3-3.5-.2-.3-.6-1.7.2-3.5 0 0 1.1-.4 3.8 1.3a13 13 0 0 1 7 0c2.7-1.7 3.8-1.3 3.8-1.3.8 1.8.4 3.2.2 3.5.8.9 1.3 2.1 1.3 3.5 0 4.9-3.1 6.1-6.1 6.4.5.5.9 1.4.9 2.6v4.6A14 14 0 0 0 16 2Z" />
  </>,
  mongodb: leaf,
  compass: <><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.8" /><g transform="translate(6 5) scale(.625)">{leaf}</g><path d="M16 1v3m0 24v3M1 16h3m24 0h3" fill="none" stroke="currentColor" strokeWidth="1.5" /></>,
  mobaxterm: <>
    <rect x="2" y="4" width="28" height="24" rx="4" />
    <rect x="4" y="6" width="24" height="20" rx="2" fill={cutout} />
    <path d="M4 8h24v5H4Z" opacity=".25" />
    <path d="m8 16 4 3-4 3m8 0h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m21 5 6 7m0-7-6 7" fill="none" stroke="var(--tool-accent, #ef9b3c)" strokeWidth="2.4" strokeLinecap="round" />
  </>,
  powershell: <>
    <path d="M7 5h23l-5 22H2L7 5Z" />
    <path d="m12 10 7 6-10 6m9 0h5" fill="none" stroke={cutout} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  bash: <>
    <path d="M16 2 29 9v14l-13 7L3 23V9L16 2Z" />
    <path d="m10 12 5 4-5 4" fill="none" stroke={cutout} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 21h5" fill="none" stroke="var(--tool-accent, #6fce87)" strokeWidth="2.5" strokeLinecap="round" />
  </>,
  workbench: <>
    <path d="M16 1 29 8.5v15L16 31 3 23.5v-15L16 1Z" />
    <g fill="none" stroke={cutout} strokeWidth="1.7"><ellipse cx="16" cy="10" rx="7" ry="3" /><path d="M9 10v12c0 4 14 4 14 0V10M9 16c0 4 14 4 14 0" /></g>
  </>,
  vscode: <>
    <path d="m23 1 8 4v22l-8 4-15-12-5 4-3-2V11l3-2 5 4L23 1Zm0 8-11 7 11 7V9ZM3 13v6l3-3-3-3Z" fillRule="evenodd" />
    <path d="m23 1 8 4v22l-8 4V1Z" opacity=".35" />
  </>,
};

export default function ToolIcon({ category, type = 'command', size = 22 }: { category: string; type?: Note['type']; size?: number }) {
  const name = category.toLocaleLowerCase().replace(/[\s._·/()\-]+/g, '');
  const tool = tools.find(tool => tool.names.some(alias => alias === name));
  if (!tool) return <span className="tool-icon tool-icon-fallback"><Icon name={category.includes('프로젝트') ? 'folder' : type === 'workflow' ? 'branch' : type === 'gui' ? 'database' : 'terminal'} size={size} /></span>;
  return <svg className="tool-icon" data-tool-icon={tool.id} style={{ '--tool-brand': tool.color } as CSSProperties} width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">{shapes[tool.id]}</svg>;
}
