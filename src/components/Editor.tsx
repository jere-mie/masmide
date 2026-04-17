import React, { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { FileNode, FileSystemState } from '../types';
import { registerMasmLanguage } from '../lib/masmLanguage';

interface EditorProps {
  state: FileSystemState;
  onStateChange: (state: FileSystemState) => void;
  onRun: () => void;
}

export const Editor: React.FC<EditorProps> = ({ state, onStateChange, onRun }) => {
  const { nodes, openFileIds, activeFileId } = state;
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const onRunRef = useRef<() => void>(onRun);
  const cleanupFindWidgetHoverRef = useRef<(() => void) | null>(null);

  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => () => cleanupFindWidgetHoverRef.current?.(), []);

  const openFiles = openFileIds
    .map(id => nodes.find(n => n.id === id) as FileNode | undefined)
    .filter((n): n is FileNode => n?.type === 'file');

  const activeFile = activeFileId
    ? (nodes.find(n => n.id === activeFileId) as FileNode | undefined)
    : undefined;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    registerMasmLanguage(monaco);
    cleanupFindWidgetHoverRef.current?.();

    // Keyboard shortcut: Ctrl/Cmd+Enter to run
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current(),
    );

    const editorDomNode = editor.getDomNode();

    if (editorDomNode) {
      // Monaco attaches delayed hover tooltips to the find widget buttons.
      // Suppress those hover events so the close button stays clickable.
      const suppressFindWidgetButtonHover = (event: MouseEvent) => {
        const target = event.target;

        if (!(target instanceof HTMLElement)) return;
        if (!target.closest('.find-widget .button, .find-widget .codicon-find-selection')) return;

        event.stopPropagation();
      };

      editorDomNode.addEventListener('mouseover', suppressFindWidgetButtonHover, true);

      const cleanup = () => {
        editorDomNode.removeEventListener('mouseover', suppressFindWidgetButtonHover, true);
      };

      cleanupFindWidgetHoverRef.current = cleanup;
      editor.onDidDispose(cleanup);
    }
  };

  // When active file changes, tell Monaco to update its model
  const handleChange = (value: string | undefined) => {
    if (!activeFileId || value === undefined) return;
    const updated = state.nodes.map(n =>
      n.id === activeFileId && n.type === 'file'
        ? { ...n, content: value, updatedAt: Date.now() }
        : n
    );
    onStateChange({ ...state, nodes: updated });
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpen = openFileIds.filter(fid => fid !== id);
    const newActive = id === activeFileId ? (newOpen[newOpen.length - 1] || null) : activeFileId;
    onStateChange({ ...state, openFileIds: newOpen, activeFileId: newActive });
  };

  const activateTab = (id: string) => {
    onStateChange({ ...state, activeFileId: id });
  };

  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[#1e1e2e] items-center justify-center text-[#6c7086]">
        <span className="text-sm font-mono">No file open - click a file in the explorer</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] overflow-hidden">
      {/* Tabs */}
      <div className="flex items-end bg-[#181825] overflow-x-auto shrink-0 border-b border-[#2d2d3f] scrollbar-none">
        {openFiles.map(file => (
          <button
            key={file.id}
            onClick={() => activateTab(file.id)}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-2 text-xs font-mono whitespace-nowrap border-r border-[#2d2d3f] shrink-0 transition-colors',
              file.id === activeFileId
                ? 'bg-[#1e1e2e] text-[#cdd6f4] border-t border-t-[#89b4fa]'
                : 'bg-[#181825] text-[#6c7086] hover:bg-[#22223a] hover:text-[#a6adc8]',
            )}
          >
            <span>{file.name}</span>
            <span
              onClick={e => closeTab(file.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-[#f38ba8] rounded transition-opacity ml-0.5"
              title="Close tab"
            >
              <X size={11} />
            </span>
          </button>
        ))}
      </div>

      {/* Monaco Editor */}
      {activeFile && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeFile.id}
            language="masm"
            value={activeFile.content}
            onChange={handleChange}
            onMount={handleMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              tabSize: 4,
              insertSpaces: false,
              wordWrap: 'off',
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
              scrollbar: { useShadows: false },
              overviewRulerLanes: 0,
            }}
          />
        </div>
      )}
    </div>
  );
};
