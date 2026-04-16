import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FileTree } from './components/FileTree';
import { Editor } from './components/Editor';
import { Console } from './components/Console';
import { Header } from './components/Header';
import type { FileSystemState, ConsoleEntry, WorkerOutMessage } from './types';
import { loadFS, saveFS, resetFS, getFileById } from './lib/storage';

const STDIN_BUF_SIZE = 65536;
const SHARED_BUF_SIZE = 8 + STDIN_BUF_SIZE;

type RuntimeStatus = 'ready' | 'initializing' | 'unsupported';

let entryCounter = 0;
function mkEntry(type: ConsoleEntry['type'], text: string): ConsoleEntry {
  return { id: String(++entryCounter), type, text };
}

function getRuntimeStatus(): RuntimeStatus {
  if (
    typeof window !== 'undefined'
    && typeof SharedArrayBuffer !== 'undefined'
    && window.crossOriginIsolated
  ) {
    return 'ready';
  }

  if (
    typeof window !== 'undefined'
    && window.isSecureContext
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
  ) {
    return 'initializing';
  }

  return 'unsupported';
}

export default function App() {
  const [fsState, setFsState] = useState<FileSystemState>(() => loadFS());
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(() => getRuntimeStatus());
  const sharedBufferRef = useRef<SharedArrayBuffer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'files' | 'editor' | 'console'>('editor');

  useEffect(() => { saveFS(fsState); }, [fsState]);

  useEffect(() => {
    const updateRuntimeStatus = () => {
      setRuntimeStatus(getRuntimeStatus());
    };

    updateRuntimeStatus();
    window.addEventListener('focus', updateRuntimeStatus);
    document.addEventListener('visibilitychange', updateRuntimeStatus);
    navigator.serviceWorker?.addEventListener('controllerchange', updateRuntimeStatus);

    return () => {
      window.removeEventListener('focus', updateRuntimeStatus);
      document.removeEventListener('visibilitychange', updateRuntimeStatus);
      navigator.serviceWorker?.removeEventListener('controllerchange', updateRuntimeStatus);
    };
  }, []);

  const appendEntry = useCallback((entry: ConsoleEntry) => {
    setEntries(prev => {
      if (prev.length > 0 && prev[prev.length - 1].type === entry.type && entry.type === 'stdout') {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, text: last.text + entry.text }];
      }
      return [...prev, entry];
    });
  }, []);

  const handleRun = useCallback(() => {
    if (runtimeStatus !== 'ready') {
      const message = runtimeStatus === 'initializing'
        ? 'The secure runtime is still initializing. The page should reload automatically once ready. If it does not, refresh once and try again.\n'
        : 'SharedArrayBuffer is unavailable in this browser context. Open the app over HTTPS and allow the page to finish loading before running a program.\n';
      setEntries([mkEntry('error', message)]);
      return;
    }

    const activeFile = fsState.activeFileId
      ? getFileById(fsState.nodes, fsState.activeFileId)
      : undefined;

    if (!activeFile) {
      setEntries([mkEntry('error', 'No file selected. Click a .asm file in the explorer.\n')]);
      return;
    }

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setEntries([]);
    setIsRunning(true);

    const buf = new SharedArrayBuffer(SHARED_BUF_SIZE);
    new Uint8Array(buf).fill(0);
    sharedBufferRef.current = buf;

    const worker = new Worker(
      new URL('./workers/wasm.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'output':
          appendEntry(mkEntry(msg.channel, msg.text));
          break;
        case 'compileError':
          appendEntry(mkEntry('error', '✖ Compilation Error:\n' + msg.text + '\n'));
          setIsRunning(false);
          break;
        case 'waitingForInput':
          break; // console accepts input any time during run
        case 'done':
          appendEntry(mkEntry('info', '\n[Process exited with code ' + msg.exitCode + ']\n'));
          setIsRunning(false);
          break;
      }
    };

    worker.onerror = (e) => {
      appendEntry(mkEntry('error', '✖ Worker error: ' + e.message + '\n'));
      setIsRunning(false);
    };

    worker.postMessage({ type: 'run', asmSource: activeFile.content, sharedBuffer: buf });
  }, [appendEntry, fsState, runtimeStatus]);

  const handleStop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    sharedBufferRef.current = null;
    setIsRunning(false);
    appendEntry(mkEntry('info', '\n[Process stopped]\n'));
  }, [appendEntry]);

  const handleInput = useCallback((text: string) => {
    const buf = sharedBufferRef.current;
    if (!buf) return;

    const signal = new Int32Array(buf, 0, 1);
    const length = new Int32Array(buf, 4, 1);
    const data = new Uint8Array(buf, 8);

    const bytes = new TextEncoder().encode(text + '\n');
    const currentLen = Atomics.load(length, 0);
    if (currentLen + bytes.length > STDIN_BUF_SIZE) return;

    data.set(bytes, currentLen);
    Atomics.store(length, 0, currentLen + bytes.length);
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);

    appendEntry(mkEntry('input', text + '\n'));
  }, [appendEntry]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning) handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isRunning, handleRun]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset workspace? This will delete all files and restore the sample program.')) return;
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    sharedBufferRef.current = null;
    setIsRunning(false);
    setEntries([]);
    setFsState(resetFS());
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#1e1e2e] text-[#cdd6f4] overflow-hidden">
      <Header
        onRun={handleRun}
        onStop={handleStop}
        onReset={handleReset}
        isRunning={isRunning}
        runtimeStatus={runtimeStatus}
      />

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-[#2d2d3f] bg-[#181825] shrink-0">
        {(['files', 'editor', 'console'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveMobileTab(tab)}
            className={`flex-1 py-2 text-xs font-mono capitalize transition-colors ${
              activeMobileTab === tab
                ? 'text-[#89b4fa] border-b-2 border-[#89b4fa]'
                : 'text-[#6c7086] hover:text-[#a6adc8]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Desktop: resizable panels */}
      <div className="hidden md:flex flex-1 overflow-hidden min-h-0">
        <Group orientation="horizontal" id="masmide-layout">
          <Panel defaultSize="18" minSize="12" maxSize="40" id="filetree">
            <FileTree state={fsState} onStateChange={setFsState} />
          </Panel>
          <Separator className="w-1.5 bg-[#2d2d3f] hover:bg-[#89b4fa]/60 active:bg-[#89b4fa] transition-colors cursor-col-resize shrink-0" />
          <Panel defaultSize="52" minSize="25" id="editor">
            <Editor state={fsState} onStateChange={setFsState} onRun={handleRun} />
          </Panel>
          <Separator className="w-1.5 bg-[#2d2d3f] hover:bg-[#89b4fa]/60 active:bg-[#89b4fa] transition-colors cursor-col-resize shrink-0" />
          <Panel defaultSize="30" minSize="15" id="console">
            <Console
              entries={entries}
              isRunning={isRunning}
              onInput={handleInput}
            />
          </Panel>
        </Group>
      </div>

      {/* Mobile: single panel at a time */}
      <div className="md:hidden flex-1 overflow-hidden">
        {activeMobileTab === 'files' && (
          <FileTree state={fsState} onStateChange={setFsState} />
        )}
        {activeMobileTab === 'editor' && (
          <Editor state={fsState} onStateChange={setFsState} onRun={handleRun} />
        )}
        {activeMobileTab === 'console' && (
          <Console
            entries={entries}
            isRunning={isRunning}
            onInput={handleInput}
          />
        )}
      </div>
    </div>
  );
}
