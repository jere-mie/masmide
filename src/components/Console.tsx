import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ConsoleEntry } from '../types';

interface ConsoleProps {
  entries: ConsoleEntry[];
  isRunning: boolean;
  onInput: (text: string) => void;
}

export const Console: React.FC<ConsoleProps> = ({ entries, isRunning, onInput }) => {
  const outputRef = useRef<HTMLDivElement>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-scroll when new output arrives
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, currentInput]);

  // Auto-focus terminal when run starts
  useEffect(() => {
    if (isRunning) {
      outputRef.current?.focus();
    }
  }, [isRunning]);

  // Clear input buffer when program stops
  useEffect(() => {
    if (!isRunning) setCurrentInput('');
  }, [isRunning]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRunning) return;

    // Pass through browser/OS shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key !== 'v') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      onInput(currentInput);
      setCurrentInput('');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      setCurrentInput(prev => prev.slice(0, -1));
    } else if (e.key.length === 1) {
      e.preventDefault();
      setCurrentInput(prev => prev + e.key);
    }
  }, [isRunning, currentInput, onInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isRunning) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    setCurrentInput(prev => prev + text);
  }, [isRunning]);

  const handleCopy = useCallback(() => {
    const text = entries.map(entry => entry.text).join('');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [entries]);

  return (
    <div className="flex flex-col h-full bg-[#11111b] font-mono text-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d2d3f] shrink-0 bg-[#181825]">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-[#6c7086]" />
          <span className="text-xs uppercase tracking-widest font-semibold text-[#6c7086]">Console</span>
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-[#a6e3a1]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] animate-pulse inline-block" />
              Running
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          title="Copy output"
          className="p-1 rounded text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#2d2d3f] transition-colors"
        >
          {copied ? <Check size={13} className="text-[#a6e3a1]" /> : <Copy size={13} />}
        </button>
      </div>

      {/* Interactive output area */}
      <div
        ref={outputRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 text-xs leading-relaxed outline-none',
          isRunning && 'cursor-text',
        )}
        style={{ wordBreak: 'break-all' }}
      >
        {entries.length === 0 && !isRunning && (
          <span className="text-[#45475a] italic select-none">
            {'Console output will appear here after running a program.\n'}
            {'Press Ctrl+Enter (or Cmd+Enter on Mac) to run.\n'}
          </span>
        )}
        {entries.map(entry => (
          <ConsoleEntryLine key={entry.id} entry={entry} />
        ))}

        {/* Inline input cursor */}
        {isRunning && (
          <span className="text-[#cdd6f4]">
            {currentInput}
            <span
              className={cn(
                'inline-block w-[7px] h-[1em] align-middle ml-px',
                isFocused ? 'bg-[#cdd6f4] animate-pulse' : 'border border-[#6c7086]',
              )}
            />
          </span>
        )}

        {/* Unfocused hint */}
        {isRunning && !isFocused && (
          <div className="text-[#45475a] text-[10px] mt-1 select-none italic">
            Click here to type input
          </div>
        )}
      </div>
    </div>
  );
};

function ConsoleEntryLine({ entry }: { entry: ConsoleEntry }) {
  const className = cn('whitespace-pre-wrap break-words block', {
    'text-[#cdd6f4]': entry.type === 'stdout',
    'text-[#f38ba8]': entry.type === 'stderr' || entry.type === 'error',
    'text-[#a6e3a1]': entry.type === 'info',
    'text-[#f9e2af]': entry.type === 'input',
  });
  return <span className={className}>{entry.text}</span>;
}
