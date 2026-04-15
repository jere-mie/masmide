# MasmIDE - Browser MASM32 IDE

A fully browser-based MASM32 IDE powered by WebAssembly. Write, compile, and run x86 assembly programs entirely in your browser - no installs required.

**Live demo:** [masm.bornais.ca](https://masm.bornais.ca)

Built using the [masm2wasm](https://github.com/jere-mie/masm2wasm) interpreter and the [easy-masm](https://github.com/jere-mie/easy-masm) subset of MASM32.

## Features

- **Monaco Editor** with MASM syntax highlighting (keywords, registers, instructions, Irvine32 procedures)
- **Three-panel layout** - file explorer | editor | console - all resizable
- **File manager** - create, rename, delete, and download files and folders; drag-and-drop to reorganize
- **Interactive console** - programs that read from stdin work; click the console and type directly during execution
- **Stop execution** - kill a running or blocked program at any time with the Stop button
- **Persistent storage** - all files are saved in `localStorage` and survive page reloads
- **Keyboard shortcut** - `Ctrl+Enter` (or `Cmd+Enter` on Mac) runs the active file
- **Mobile responsive** - tab-based layout on small screens (Files / Editor / Console)
- **Easy reset** - restore the sample workspace with one click

## Quick Start

1. Open the IDE (or run locally - see below)
2. Edit `main.asm` in the editor (or create a new file)
3. Press **Run** or `Ctrl+Enter`
4. View output in the Console panel

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | Run active file |

## File Management

| Action | How |
|---|---|
| Open file | Click file in explorer |
| Rename | Right-click → Rename |
| Delete | Right-click → Delete |
| Download | Right-click → Download |
| New file | Click `+` (file icon) in explorer header |
| New folder | Click `+` (folder icon) in explorer header |
| Move file/folder | Drag and drop |
| Expand/collapse folder | Click the folder name |

## Tech Stack

| Library | Purpose |
|---|---|
| [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript | App framework |
| [Tailwind CSS v4](https://tailwindcss.com/) | Styling |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | Code editor |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Resizable layout |
| [@bjorn3/browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) | WASI runtime in browser |
| [masm2wasm](https://github.com/jere-mie/masm2wasm) | MASM → WASM compiler (Go/WASIP1) |
| [Radix UI](https://www.radix-ui.com/) | Context menus, dialogs |
| [lucide-react](https://lucide.dev/) | Icons |

## Architecture

Execution is two-phase, entirely client-side:

1. **Compile** - The ASM source is fed as stdin to `masm2wasm.wasm` (a Go WASIP1 binary). It translates MASM to a WASM module and writes the bytes to stdout.
2. **Run** - The generated `.wasm` is instantiated with a custom WASI environment. Stdin is bridged to the console input via `SharedArrayBuffer` + `Atomics`, enabling blocking reads from interactive programs.

Both phases run in a **Web Worker** so the UI stays responsive. The worker caches the compiled translator module to avoid re-fetching the 13 MB binary on every run.

> **Note:** `SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. These are set in `vite.config.ts` for local dev/preview and injected via `coi-serviceworker.js` when deployed to GitHub Pages.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Type-check + production build
npm run build
```

## Deployment

The project is automatically deployed to [masm.bornais.ca](https://masm.bornais.ca) via GitHub Actions on every push to `main`.

To deploy to your own GitHub Pages:

1. Fork the repository
2. Go to **Settings → Pages** and set source to **GitHub Actions**
3. Push to `main` - the workflow in `.github/workflows/deploy.yml` will build and deploy automatically
4. To use a custom domain, update `public/CNAME` with your domain

### SharedArrayBuffer on static hosts

Interactive programs (e.g. `ReadString`) require `SharedArrayBuffer`, which browsers only expose in [cross-origin isolated](https://web.dev/cross-origin-isolation-guide/) contexts (`COOP: same-origin` + `COEP: require-corp` headers). GitHub Pages doesn't support custom response headers.

The included `public/coi-serviceworker.js` works around this automatically - it registers a service worker that patches the response headers on every request. No extra configuration needed.

## Sample Program

The default workspace includes the [easy-masm](https://github.com/jere-mie/easy-masm) sample:

```asm
TITLE My MASM Program

INCLUDE Irvine32.inc
INCLUDELIB Irvine32.lib
INCLUDELIB kernel32.lib
INCLUDELIB user32.lib

.data
    lineMsg    BYTE "#########################", 0dh, 0ah, 0
    welcomeMsg BYTE "# Welcome to easy-masm! #", 0dh, 0ah, 0

.code
main PROC
    mov edx, OFFSET lineMsg
    call WriteString
    mov edx, OFFSET welcomeMsg
    call WriteString
    mov edx, OFFSET lineMsg
    call WriteString
    call DumpRegs
    exit
main ENDP
END main
```

## License

MIT

