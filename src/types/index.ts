export interface FileNode {
  id: string;
  type: 'file';
  name: string;
  parentId: string | null;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface FolderNode {
  id: string;
  type: 'folder';
  name: string;
  parentId: string | null;
  expanded: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FSNode = FileNode | FolderNode;

export interface FileSystemState {
  nodes: FSNode[];
  activeFileId: string | null;
  openFileIds: string[];
}

export type ConsoleEntryType = 'stdout' | 'stderr' | 'info' | 'error' | 'input';

export interface ConsoleEntry {
  id: string;
  type: ConsoleEntryType;
  text: string;
}

export type WorkerOutMessage =
  | { type: 'output'; channel: 'stdout' | 'stderr'; text: string }
  | { type: 'compileError'; text: string }
  | { type: 'done'; exitCode: number }
  | { type: 'waitingForInput' };

export type WorkerInMessage =
  | { type: 'run'; asmSource: string; sharedBuffer: SharedArrayBuffer }
  | { type: 'kill' };
