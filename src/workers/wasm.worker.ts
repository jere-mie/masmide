/**
 * WASM Worker: compiles MASM source via masm2wasm.wasm then runs the output.
 *
 * SharedArrayBuffer layout (65544 bytes):
 *   [0-3]   Int32 - signal: 0 = no data waiting, 1 = data available
 *   [4-7]   Int32 - byte count of data in the ring
 *   [8-...]  Uint8 - data ring (65536 bytes)
 */

import { WASI, Fd } from '@bjorn3/browser_wasi_shim';
import { wasi as wasiDefs } from '@bjorn3/browser_wasi_shim';

// ──────────────────────────────────────────────
// Custom FD: wraps a pre-loaded Uint8Array as stdin (for the compiler phase)
// ──────────────────────────────────────────────
class BytesStdinFd extends Fd {
  private data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    super();
    this.data = data;
  }

  override fd_fdstat_get() {
    return { ret: wasiDefs.ERRNO_SUCCESS, fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0) };
  }

  override fd_read(size: number) {
    const avail = this.data.length - this.pos;
    const toRead = Math.min(size, avail);
    const out = this.data.slice(this.pos, this.pos + toRead);
    this.pos += toRead;
    return { ret: wasiDefs.ERRNO_SUCCESS, data: out };
  }
}

// ──────────────────────────────────────────────
// Custom FD: captures all writes into a buffer (for compiler stdout = .wasm bytes)
// ──────────────────────────────────────────────
class CaptureFd extends Fd {
  private chunks: Uint8Array[] = [];

  override fd_fdstat_get() {
    return { ret: wasiDefs.ERRNO_SUCCESS, fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0) };
  }

  override fd_write(data: Uint8Array) {
    this.chunks.push(new Uint8Array(data));
    return { ret: wasiDefs.ERRNO_SUCCESS, nwritten: data.length };
  }

  getBytes(): Uint8Array {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) { out.set(c, offset); offset += c.length; }
    return out;
  }
}

// ──────────────────────────────────────────────
// Custom FD: posts each write as a message to the main thread
// ──────────────────────────────────────────────
class PostFd extends Fd {
  private channel: 'stdout' | 'stderr';
  private decoder = new TextDecoder();

  constructor(channel: 'stdout' | 'stderr') {
    super();
    this.channel = channel;
  }

  override fd_fdstat_get() {
    return { ret: wasiDefs.ERRNO_SUCCESS, fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0) };
  }

  override fd_write(data: Uint8Array) {
    const text = this.decoder.decode(data);
    self.postMessage({ type: 'output', channel: this.channel, text });
    return { ret: wasiDefs.ERRNO_SUCCESS, nwritten: data.length };
  }
}

// ──────────────────────────────────────────────
// Custom FD: blocking stdin via SharedArrayBuffer + Atomics (program phase)
// ──────────────────────────────────────────────
class BlockingStdinFd extends Fd {
  private signal: Int32Array;   // offset 0, length 1  (0=empty, 1=has data)
  private length: Int32Array;   // offset 4, length 1  (byte count)
  private buf: Uint8Array;      // offset 8, length STDIN_BUF_SIZE

  constructor(shared: SharedArrayBuffer) {
    super();
    this.signal = new Int32Array(shared, 0, 1);
    this.length = new Int32Array(shared, 4, 1);
    this.buf = new Uint8Array(shared, 8);
  }

  override fd_fdstat_get() {
    return { ret: wasiDefs.ERRNO_SUCCESS, fdstat: new wasiDefs.Fdstat(wasiDefs.FILETYPE_CHARACTER_DEVICE, 0) };
  }

  override fd_filestat_get() {
    return { ret: wasiDefs.ERRNO_SUCCESS, filestat: new wasiDefs.Filestat(0n, wasiDefs.FILETYPE_CHARACTER_DEVICE, 0n) };
  }

  override fd_read(size: number) {
    // Block until data arrives
    while (Atomics.load(this.signal, 0) === 0) {
      Atomics.wait(this.signal, 0, 0, 200); // 200ms timeout, retry
    }

    const avail = Atomics.load(this.length, 0);
    const toRead = Math.min(size, avail);
    const data = new Uint8Array(this.buf.slice(0, toRead));

    const remaining = avail - toRead;
    if (remaining > 0) {
      this.buf.copyWithin(0, toRead, avail);
    }
    Atomics.store(this.length, 0, remaining);
    if (remaining === 0) {
      Atomics.store(this.signal, 0, 0);
    }
    return { ret: wasiDefs.ERRNO_SUCCESS, data };
  }
}

// ──────────────────────────────────────────────
// Patch poll_oneoff on the wasi.wasiImport object to properly handle
// both clock and fd-read subscriptions, and write nevents (4th arg).
// ──────────────────────────────────────────────
function patchPollOneoff(
  wasiImport: Record<string, unknown>,
  getMemory: () => ArrayBuffer,
  stdinShared?: SharedArrayBuffer,
) {
  wasiImport.poll_oneoff = (
    in_ptr: number,
    out_ptr: number,
    nsubscriptions: number,
    nevents_ptr: number,
  ): number => {
    if (nsubscriptions === 0) return 28; // ERRNO_INVAL

    const view = new DataView(getMemory());
    let nOut = 0;

    for (let i = 0; i < nsubscriptions; i++) {
      const base = in_ptr + i * 48;
      const userdata = view.getBigUint64(base, true);
      const eventtype = view.getUint8(base + 8);

      if (eventtype === 0) {
        // EVENTTYPE_CLOCK
        const clockid = view.getUint32(base + 16, true);
        const timeout = view.getBigUint64(base + 24, true);
        const flags = view.getUint16(base + 36, true);

        const getNow: () => bigint =
          clockid === 1
            ? () => BigInt(Math.round(performance.now() * 1e6))
            : () => BigInt(Date.now()) * 1_000_000n;

        const absTime = (flags & 1) !== 0 ? timeout : getNow() + timeout;
        while (absTime > getNow()) {/* spin */}

        const evBase = out_ptr + nOut * 32;
        view.setBigUint64(evBase, userdata, true);
        view.setUint16(evBase + 8, 0, true);
        view.setUint8(evBase + 10, 0); // CLOCK
        nOut++;

      } else if (eventtype === 1) {
        // EVENTTYPE_FD_READ
        const fd = view.getUint32(base + 16, true);
        let ready = false;
        if (fd === 0 && stdinShared) {
          ready = Atomics.load(new Int32Array(stdinShared, 0, 1), 0) !== 0;
        } else {
          ready = fd !== 0;
        }
        if (ready) {
          const evBase = out_ptr + nOut * 32;
          view.setBigUint64(evBase, userdata, true);
          view.setUint16(evBase + 8, 0, true);
          view.setUint8(evBase + 10, 1); // FD_READ
          view.setBigUint64(evBase + 16, 0n, true);
          view.setUint16(evBase + 24, 0, true);
          nOut++;
        }

      } else if (eventtype === 2) {
        // EVENTTYPE_FD_WRITE - always ready
        const evBase = out_ptr + nOut * 32;
        view.setBigUint64(evBase, userdata, true);
        view.setUint16(evBase + 8, 0, true);
        view.setUint8(evBase + 10, 2); // FD_WRITE
        nOut++;
      }
    }

    if (nevents_ptr !== undefined) {
      view.setUint32(nevents_ptr, nOut, true);
    }
    return 0; // ERRNO_SUCCESS
  };
}

// ──────────────────────────────────────────────
// Build a WASI instance + instantiate a module, optionally patching poll_oneoff
// ──────────────────────────────────────────────
async function instantiateWasi(
  moduleBytes: ArrayBuffer,
  args: string[],
  fds: Fd[],
  stdinShared?: SharedArrayBuffer,
): Promise<{ wasi: WASI; instance: WebAssembly.Instance }> {
  const wasi = new WASI(args, [], fds);

  // We'll fill this in once instance is created; poll_oneoff runs inside _start so it's fine
  let memoryBuffer: ArrayBuffer | null = null;
  patchPollOneoff(
    wasi.wasiImport as Record<string, unknown>,
    () => memoryBuffer ?? new ArrayBuffer(0),
    stdinShared,
  );

  const { instance } = await WebAssembly.instantiate(moduleBytes, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  memoryBuffer = (instance.exports.memory as WebAssembly.Memory).buffer;

  return { wasi, instance };
}

// ──────────────────────────────────────────────
// Cached compiled masm2wasm module
// ──────────────────────────────────────────────
let compiledTranslator: WebAssembly.Module | null = null;

async function getTranslator(): Promise<WebAssembly.Module> {
  if (!compiledTranslator) {
    const resp = await fetch('/masm2wasm.wasm');
    if (!resp.ok) throw new Error(`Failed to fetch masm2wasm.wasm: ${resp.status}`);
    const bytes = await resp.arrayBuffer();
    compiledTranslator = await WebAssembly.compile(bytes);
  }
  return compiledTranslator;
}

// ──────────────────────────────────────────────
// Main worker message handler
// ──────────────────────────────────────────────
let killed = false;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'kill') {
    killed = true;
    return;
  }

  if (msg.type !== 'run') return;

  killed = false;
  const { asmSource, sharedBuffer } = msg as { asmSource: string; sharedBuffer: SharedArrayBuffer };

  // ── Phase 1: compile ASM → WASM ─────────────────────────────────────────
  self.postMessage({ type: 'output', channel: 'stdout', text: '⚙  Compiling...\n' });

  let wasmBytes: Uint8Array;

  try {
    const translator = await getTranslator();

    const asmBytes = new TextEncoder().encode(asmSource);
    const stdinFd = new BytesStdinFd(asmBytes);
    const stdoutFd = new CaptureFd();
    const stderrFd = new CaptureFd();

    const wasi = new WASI(
      ['masm2wasm', 'build', '-i', '-', '-o', '-'],
      [],
      [stdinFd, stdoutFd, stderrFd],
    );

    let memBuf: ArrayBuffer | null = null;
    patchPollOneoff(
      wasi.wasiImport as Record<string, unknown>,
      () => memBuf ?? new ArrayBuffer(0),
    );

    const instance = await WebAssembly.instantiate(translator, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    memBuf = (instance.exports.memory as WebAssembly.Memory).buffer;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wasi.start(instance as any);
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code !== 0 && code !== undefined) {
        const errText = new TextDecoder().decode(stderrFd.getBytes());
        self.postMessage({ type: 'compileError', text: errText || 'Compilation failed' });
        return;
      }
    }

    // Check for stderr output (warnings / errors from compiler)
    const compileStderr = new TextDecoder().decode(stderrFd.getBytes());
    if (compileStderr) {
      self.postMessage({ type: 'output', channel: 'stderr', text: compileStderr });
    }

    wasmBytes = stdoutFd.getBytes();
    if (wasmBytes.length === 0) {
      self.postMessage({ type: 'compileError', text: 'Compiler produced no output' });
      return;
    }
  } catch (err: unknown) {
    self.postMessage({ type: 'compileError', text: String(err) });
    return;
  }

  if (killed) return;

  // ── Phase 2: run the generated program ──────────────────────────────────
  self.postMessage({ type: 'output', channel: 'stdout', text: '' });

  try {
    const stdinFd = new BlockingStdinFd(sharedBuffer);
    const stdoutFd = new PostFd('stdout');
    const stderrFd = new PostFd('stderr');

    const { wasi, instance } = await instantiateWasi(
      wasmBytes.buffer as ArrayBuffer,
      ['program'],
      [stdinFd, stdoutFd, stderrFd],
      sharedBuffer,
    );

    if (killed) return;

    // Signal that we're about to read from stdin
    self.postMessage({ type: 'waitingForInput' });

    let exitCode = 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exitCode = wasi.start(instance as any) ?? 0;
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      exitCode = typeof code === 'number' ? code : 1;
    }

    self.postMessage({ type: 'done', exitCode });
  } catch (err: unknown) {
    self.postMessage({ type: 'output', channel: 'stderr', text: String(err) + '\n' });
    self.postMessage({ type: 'done', exitCode: 1 });
  }
};
