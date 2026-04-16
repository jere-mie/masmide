import React from 'react';
import { Play, Square, RotateCcw, GitFork, Code2 } from 'lucide-react';

interface HeaderProps {
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
  isRunning: boolean;
  runtimeStatus: 'ready' | 'initializing' | 'unsupported';
}

export const Header: React.FC<HeaderProps> = ({ onRun, onStop, onReset, isRunning, runtimeStatus }) => {
  const runDisabled = runtimeStatus !== 'ready';
  const runLabel = runtimeStatus === 'initializing' ? 'Starting...' : runtimeStatus === 'unsupported' ? 'Unavailable' : 'Run';
  const runTitle = runtimeStatus === 'initializing'
    ? 'Initializing secure runtime'
    : runtimeStatus === 'unsupported'
      ? 'SharedArrayBuffer is unavailable in this browser context'
      : 'Run (Ctrl+Enter / ⌘↵)';

  return (
    <header className="flex items-center justify-between h-12 px-4 bg-[#12121f] border-b border-[#2d2d3f] shrink-0 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Code2 size={18} className="text-[#89b4fa]" />
        <span className="text-base font-bold font-mono tracking-tight">
          <span className="text-[#cdd6f4]">Masm</span><span className="text-[#89b4fa]">IDE</span>
        </span>
        <span className="hidden lg:inline text-xs text-[#45475a] font-mono">- MASM32 Browser IDE</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {isRunning ? (
          <button
            onClick={onStop}
            title="Stop execution"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium font-mono bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 border border-[#f38ba8]/30 transition-colors cursor-pointer"
          >
            <Square size={13} fill="currentColor" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={onRun}
            title={runTitle}
            disabled={runDisabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium font-mono transition-colors ${
              runDisabled
                ? 'bg-[#45475a] text-[#bac2de] cursor-not-allowed opacity-70'
                : 'bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] cursor-pointer'
            }`}
          >
            <Play size={13} fill="currentColor" />
            <span>{runLabel}</span>
            <kbd className="hidden sm:inline-block ml-0.5 text-[10px] opacity-50 font-sans bg-[#1e1e2e]/20 px-1 py-px rounded">
              ⌃↵
            </kbd>
          </button>
        )}

        <button
          onClick={onReset}
          title="Reset workspace"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium font-mono text-[#6c7086] hover:bg-[#2d2d3f] hover:text-[#cdd6f4] transition-colors"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <a
          href="https://github.com/jere-mie/masmide"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-[#6c7086] hover:bg-[#2d2d3f] hover:text-[#cdd6f4] transition-colors"
          title="View on GitHub"
        >
          <GitFork size={13} />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </div>
    </header>
  );
};
