import type { FSNode, FileNode, FolderNode, FileSystemState } from '../types';

const FS_KEY = 'masmide_fs_v2';
const OPEN_KEY = 'masmide_open_v2';
const ACTIVE_KEY = 'masmide_active_v2';

export const DEFAULT_ASM = `TITLE My MASM Program

; Name: 
; Date: 
; ID: 
; Description: 

INCLUDE Irvine32.inc
INCLUDELIB Irvine32.lib

; these two lines are only necessary if you're not using Visual Studio
INCLUDELIB kernel32.lib
INCLUDELIB user32.lib

.data
    
\t; data declarations go here
\tlineMsg BYTE    "#########################", 0dh, 0ah, 0
\twelcomeMsg BYTE "# Welcome to easy-masm! #", 0dh, 0ah, 0

.code
main PROC
\t
\t; code goes here

\tmov edx, OFFSET lineMsg
\tcall WriteString

\tmov edx, OFFSET welcomeMsg
\tcall WriteString

\tmov edx, OFFSET lineMsg
\tcall WriteString

\tcall DumpRegs ; displays registers in console

\texit

main ENDP
END main
`;

function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function buildDefault(): FileSystemState {
  const now = Date.now();
  const folderId = genId();
  const fileId = genId();

  const folder: FolderNode = {
    id: folderId,
    type: 'folder',
    name: 'my-project',
    parentId: null,
    expanded: true,
    createdAt: now,
    updatedAt: now,
  };

  const file: FileNode = {
    id: fileId,
    type: 'file',
    name: 'main.asm',
    parentId: folderId,
    content: DEFAULT_ASM,
    createdAt: now,
    updatedAt: now,
  };

  return {
    nodes: [folder, file],
    openFileIds: [fileId],
    activeFileId: fileId,
  };
}

export function loadFS(): FileSystemState {
  try {
    const raw = localStorage.getItem(FS_KEY);
    if (raw) {
      const nodes: FSNode[] = JSON.parse(raw);
      const openFileIds: string[] = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]');
      const activeFileId = localStorage.getItem(ACTIVE_KEY) || null;
      if (nodes.length > 0) {
        return { nodes, openFileIds, activeFileId };
      }
    }
  } catch {
    // fall through to default
  }
  return buildDefault();
}

export function saveFS(state: FileSystemState): void {
  try {
    localStorage.setItem(FS_KEY, JSON.stringify(state.nodes));
    localStorage.setItem(OPEN_KEY, JSON.stringify(state.openFileIds));
    if (state.activeFileId) {
      localStorage.setItem(ACTIVE_KEY, state.activeFileId);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch (e) {
    console.error('storage error', e);
  }
}

export function resetFS(): FileSystemState {
  localStorage.removeItem(FS_KEY);
  localStorage.removeItem(OPEN_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  return buildDefault();
}

export function genNodeId(): string {
  return genId();
}

export function getFileById(nodes: FSNode[], id: string): FileNode | undefined {
  const n = nodes.find(n => n.id === id);
  return n?.type === 'file' ? n : undefined;
}

export function getChildren(nodes: FSNode[], parentId: string | null): FSNode[] {
  return nodes.filter(n => n.parentId === parentId);
}

export function getDescendantIds(nodes: FSNode[], folderId: string): string[] {
  const result: string[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = nodes.filter(n => n.parentId === id);
    for (const child of children) {
      result.push(child.id);
      if (child.type === 'folder') queue.push(child.id);
    }
  }
  return result;
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
