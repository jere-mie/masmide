import React, { useState, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Trash2,
  Pencil,
  Download,
} from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../lib/utils';
import type { FSNode, FileNode, FolderNode, FileSystemState } from '../types';
import { getChildren, genNodeId, downloadText } from '../lib/storage';

interface FileTreeProps {
  state: FileSystemState;
  onStateChange: (state: FileSystemState) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ state, onStateChange }) => {
  const { nodes, activeFileId, openFileIds } = state;
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [newItemParentId, setNewItemParentId] = useState<string | null>(null);
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [newItemName, setNewItemName] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((partial: Partial<FileSystemState>) => {
    onStateChange({ ...state, ...partial });
  }, [state, onStateChange]);

  // Toggle folder expand
  const toggleFolder = (id: string) => {
    const updated = nodes.map(n =>
      n.id === id && n.type === 'folder'
        ? { ...n, expanded: !n.expanded }
        : n
    );
    update({ nodes: updated });
  };

  // Open a file
  const openFile = (id: string) => {
    const newOpen = openFileIds.includes(id) ? openFileIds : [...openFileIds, id];
    update({ activeFileId: id, openFileIds: newOpen });
  };

  // Delete a node (and descendants)
  const deleteNode = (id: string) => {
    const descendants = getAllDescendants(nodes, id);
    const toRemove = new Set([id, ...descendants]);
    const newNodes = nodes.filter(n => !toRemove.has(n.id));
    const newOpen = openFileIds.filter(fid => !toRemove.has(fid));
    const newActive = toRemove.has(activeFileId || '') ? (newOpen[0] || null) : activeFileId;
    update({ nodes: newNodes, openFileIds: newOpen, activeFileId: newActive });
  };

  // Rename
  const startRename = (node: FSNode) => {
    setRenameId(node.id);
    setRenameName(node.name);
    setRenameDialogOpen(true);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const confirmRename = () => {
    if (!renameId || !renameName.trim()) return;
    const updated = nodes.map(n =>
      n.id === renameId ? { ...n, name: renameName.trim(), updatedAt: Date.now() } : n
    );
    update({ nodes: updated });
    setRenameDialogOpen(false);
    setRenameId(null);
  };

  // New file/folder
  const startNew = (parentId: string | null, type: 'file' | 'folder') => {
    setNewItemParentId(parentId);
    setNewItemType(type);
    setNewItemName(type === 'file' ? 'new-file.asm' : 'new-folder');
    setNewDialogOpen(true);
    setTimeout(() => {
      newInputRef.current?.focus();
      newInputRef.current?.select();
    }, 50);
  };

  const confirmNew = () => {
    if (!newItemName.trim()) return;
    const now = Date.now();
    const id = genNodeId();
    let newNode: FSNode;

    if (newItemType === 'file') {
      newNode = {
        id, type: 'file', name: newItemName.trim(),
        parentId: newItemParentId, content: '; New file\n',
        createdAt: now, updatedAt: now,
      } as FileNode;
    } else {
      newNode = {
        id, type: 'folder', name: newItemName.trim(),
        parentId: newItemParentId, expanded: true,
        createdAt: now, updatedAt: now,
      } as FolderNode;
    }

    // Ensure parent is expanded
    const updatedNodes = newItemParentId
      ? nodes.map(n => n.id === newItemParentId && n.type === 'folder' ? { ...n, expanded: true } : n)
      : [...nodes];
    updatedNodes.push(newNode);

    if (newItemType === 'file') {
      const newOpen = [...openFileIds, id];
      update({ nodes: updatedNodes, openFileIds: newOpen, activeFileId: id });
    } else {
      update({ nodes: updatedNodes });
    }
    setNewDialogOpen(false);
    setNewItemName('');
  };

  // Download
  const downloadNode = (node: FSNode) => {
    if (node.type === 'file') {
      downloadText(node.name, node.content);
    } else {
      const files = collectFiles(nodes, node.id, '');
      files.forEach(f => downloadText(f.name, f.content));
    }
  };

  // Drag and drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    setDropTargetId(targetId);
  };
  const handleDrop = (e: React.DragEvent, targetParentId: string | null) => {
    e.preventDefault();
    if (!dragId || dragId === targetParentId) return;
    // Prevent dropping a folder into itself
    if (targetParentId && getAllDescendants(nodes, dragId).includes(targetParentId)) return;

    const updated = nodes.map(n =>
      n.id === dragId ? { ...n, parentId: targetParentId } : n
    );
    setDragId(null);
    setDropTargetId(null);
    update({ nodes: updated });
  };
  const handleDragEnd = () => { setDragId(null); setDropTargetId(null); };

  const rootNodes = getChildren(nodes, null);

  return (
    <div className="flex flex-col h-full bg-[#181825] text-[#cdd6f4] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d2d3f] shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#6c7086]">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => startNew(null, 'file')}
            title="New file"
            className="p-1 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#2d2d3f] transition-colors"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={() => startNew(null, 'folder')}
            title="New folder"
            className="p-1 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#2d2d3f] transition-colors"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        onDragOver={e => handleDragOver(e, null)}
        onDrop={e => handleDrop(e, null)}
      >
        {rootNodes.length === 0 && (
          <p className="px-4 py-3 text-xs text-[#6c7086]">No files yet. Create a new file above.</p>
        )}
        {rootNodes.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            nodes={nodes}
            depth={0}
            activeFileId={activeFileId}
            dragId={dragId}
            dropTargetId={dropTargetId}
            onToggle={toggleFolder}
            onOpen={openFile}
            onDelete={deleteNode}
            onRename={startRename}
            onDownload={downloadNode}
            onNewFile={(parentId) => startNew(parentId, 'file')}
            onNewFolder={(parentId) => startNew(parentId, 'folder')}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Rename Dialog */}
      <Dialog.Root open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1e1e2e] border border-[#313244] rounded-lg p-4 w-80 shadow-2xl">
            <Dialog.Title className="text-sm font-semibold text-[#cdd6f4] mb-3">Rename</Dialog.Title>
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenameDialogOpen(false); }}
              className="w-full bg-[#313244] text-[#cdd6f4] rounded px-3 py-2 text-sm font-mono border border-[#45475a] focus:outline-none focus:border-[#89b4fa]"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRenameDialogOpen(false)} className="px-3 py-1.5 text-sm rounded text-[#a6adc8] hover:bg-[#313244] transition-colors">Cancel</button>
              <button onClick={confirmRename} className="px-3 py-1.5 text-sm rounded bg-[#89b4fa] text-[#1e1e2e] font-medium hover:bg-[#74c7ec] transition-colors">Rename</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* New Item Dialog */}
      <Dialog.Root open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1e1e2e] border border-[#313244] rounded-lg p-4 w-80 shadow-2xl">
            <Dialog.Title className="text-sm font-semibold text-[#cdd6f4] mb-3">
              New {newItemType === 'file' ? 'File' : 'Folder'}
            </Dialog.Title>
            <input
              ref={newInputRef}
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') setNewDialogOpen(false); }}
              className="w-full bg-[#313244] text-[#cdd6f4] rounded px-3 py-2 text-sm font-mono border border-[#45475a] focus:outline-none focus:border-[#89b4fa]"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setNewDialogOpen(false)} className="px-3 py-1.5 text-sm rounded text-[#a6adc8] hover:bg-[#313244] transition-colors">Cancel</button>
              <button onClick={confirmNew} className="px-3 py-1.5 text-sm rounded bg-[#89b4fa] text-[#1e1e2e] font-medium hover:bg-[#74c7ec] transition-colors">Create</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Individual tree node
// ──────────────────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FSNode;
  nodes: FSNode[];
  depth: number;
  activeFileId: string | null;
  dragId: string | null;
  dropTargetId: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (node: FSNode) => void;
  onDownload: (node: FSNode) => void;
  onNewFile: (parentId: string) => void;
  onNewFolder: (parentId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string | null) => void;
  onDrop: (e: React.DragEvent, parentId: string | null) => void;
  onDragEnd: () => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node, nodes, depth, activeFileId, dragId, dropTargetId,
  onToggle, onOpen, onDelete, onRename, onDownload,
  onNewFile, onNewFolder, onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const isFolder = node.type === 'folder';
  const isActive = node.id === activeFileId;
  const isDragging = dragId === node.id;
  const isDropTarget = dropTargetId === node.id;
  const childNodes = isFolder ? getChildren(nodes, node.id) : [];
  const expanded = isFolder ? (node as FolderNode).expanded : false;

  const indent = depth * 12 + 8;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div>
          <div
            draggable
            onDragStart={() => onDragStart(node.id)}
            onDragOver={e => onDragOver(e, isFolder ? node.id : node.parentId)}
            onDrop={e => onDrop(e, isFolder ? node.id : node.parentId)}
            onDragEnd={onDragEnd}
            onClick={() => isFolder ? onToggle(node.id) : onOpen(node.id)}
            className={cn(
              'flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer text-sm font-mono select-none rounded-sm mx-1 transition-colors group',
              isActive && !isFolder && 'bg-[#313244] text-[#cdd6f4]',
              !isActive && 'text-[#a6adc8] hover:bg-[#262637] hover:text-[#cdd6f4]',
              isDragging && 'opacity-40',
              isDropTarget && 'bg-[#313244] outline outline-1 outline-[#89b4fa]',
            )}
            style={{ paddingLeft: indent }}
          >
            {/* Expand arrow for folders */}
            {isFolder ? (
              <span className="text-[#6c7086] shrink-0">
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            ) : (
              <span className="w-3 shrink-0" />
            )}

            {/* Icon */}
            {isFolder ? (
              expanded
                ? <FolderOpen size={14} className="text-[#f9e2af] shrink-0" />
                : <Folder size={14} className="text-[#f9e2af] shrink-0" />
            ) : (
              <File size={14} className="text-[#89b4fa] shrink-0" />
            )}

            {/* Name */}
            <span className="truncate flex-1 text-xs">{node.name}</span>
          </div>

          {/* Children */}
          {isFolder && expanded && childNodes.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              activeFileId={activeFileId}
              dragId={dragId}
              dropTargetId={dropTargetId}
              onToggle={onToggle}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
              onDownload={onDownload}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="bg-[#1e1e2e] border border-[#313244] rounded-md shadow-2xl py-1 min-w-[160px] z-50"
        >
          <ContextMenu.Item
            onSelect={() => onRename(node)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313244] cursor-pointer outline-none"
          >
            <Pencil size={12} /> Rename
          </ContextMenu.Item>

          {isFolder && (
            <>
              <ContextMenu.Item
                onSelect={() => onNewFile(node.id)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313244] cursor-pointer outline-none"
              >
                <FilePlus size={12} /> New File
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={() => onNewFolder(node.id)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313244] cursor-pointer outline-none"
              >
                <FolderPlus size={12} /> New Folder
              </ContextMenu.Item>
            </>
          )}

          <ContextMenu.Item
            onSelect={() => onDownload(node)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-[#313244] cursor-pointer outline-none"
          >
            <Download size={12} /> Download
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1 border-t border-[#313244]" />

          <ContextMenu.Item
            onSelect={() => onDelete(node.id)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#f38ba8] hover:bg-[#313244] cursor-pointer outline-none"
          >
            <Trash2 size={12} /> Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getAllDescendants(nodes: FSNode[], id: string): string[] {
  const result: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const children = nodes.filter(n => n.parentId === curr);
    for (const c of children) {
      result.push(c.id);
      queue.push(c.id);
    }
  }
  return result;
}

function collectFiles(nodes: FSNode[], folderId: string, prefix: string): { name: string; content: string }[] {
  const result: { name: string; content: string }[] = [];
  const children = getChildren(nodes, folderId);
  for (const node of children) {
    if (node.type === 'file') {
      result.push({ name: prefix + node.name, content: node.content });
    } else {
      result.push(...collectFiles(nodes, node.id, prefix + node.name + '/'));
    }
  }
  return result;
}
