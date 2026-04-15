import type * as Monaco from 'monaco-editor';

export function registerMasmLanguage(monaco: typeof Monaco) {
  if (monaco.languages.getLanguages().some(l => l.id === 'masm')) return;

  monaco.languages.register({ id: 'masm', extensions: ['.asm', '.inc'], aliases: ['MASM', 'masm'] });

  monaco.languages.setMonarchTokensProvider('masm', {
    defaultToken: '',
    tokenPostfix: '.masm',
    ignoreCase: true,

    keywords: [
      'TITLE', 'INCLUDE', 'INCLUDELIB', 'PROTO', 'PROC', 'ENDP', 'END',
      'USES', 'LOCAL', 'INVOKE', 'CALL', 'RET', 'EXIT', 'EXTERN',
      'PUBLIC', 'EXTRN',
      '.DATA', '.DATA?', '.CONST', '.CODE', '.STACK', '.MODEL', '.IF', '.ELSEIF',
      '.ELSE', '.ENDIF', '.WHILE', '.ENDW', '.REPEAT', '.UNTIL', '.BREAK',
      '.CONTINUE', '.EXIT',
      'IF', 'ELSE', 'ENDIF', 'MACRO', 'ENDM', 'REPT', 'REPEAT',
      'FOR', 'FORC', 'WHILE', 'STRUCT', 'ENDS', 'UNION', 'LABEL',
      'ALIGN', 'EVEN', 'OFFSET', 'ADDR', 'TYPE', 'SIZEOF', 'SIZE',
      'LENGTHOF', 'LENGTH', 'PTR', 'NEAR', 'FAR', 'DUP',
      'EQU', 'TEXTEQU', 'COMMENT',
    ],

    datatypes: [
      'BYTE', 'SBYTE', 'WORD', 'SWORD', 'DWORD', 'SDWORD',
      'QWORD', 'TBYTE', 'REAL4', 'REAL8', 'REAL10',
      'DB', 'DW', 'DD', 'DQ', 'DT',
    ],

    registers: [
      'eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'esp', 'ebp',
      'ax', 'bx', 'cx', 'dx', 'si', 'di', 'sp', 'bp',
      'al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh',
      'cs', 'ds', 'es', 'fs', 'gs', 'ss',
      'eip', 'eflags',
      'st', 'st0', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7',
    ],

    instructions: [
      'mov', 'lea', 'add', 'sub', 'inc', 'dec', 'neg', 'mul', 'imul',
      'div', 'idiv', 'cdq', 'xor', 'and', 'or', 'not', 'test', 'cmp',
      'movzx', 'movsx', 'xchg', 'shl', 'shr', 'sar', 'sal',
      'push', 'pop', 'pushad', 'popad', 'pushfd', 'popfd',
      'jmp', 'je', 'jz', 'jne', 'jnz', 'jl', 'jle', 'jg', 'jge',
      'jb', 'jbe', 'ja', 'jae', 'jc', 'jnc', 'js', 'jns', 'jo', 'jno',
      'jng', 'jnl', 'jnge', 'jnle', 'jna', 'jnb', 'jnbe', 'jnae',
      'jcxz', 'jecxz', 'loop', 'call', 'ret', 'nop', 'leave',
      'cld', 'std', 'lodsb', 'lodsw', 'lodsd', 'stosb', 'stosw', 'stosd',
      'movsb', 'movsw', 'movsd', 'cmpsb', 'cmpsw', 'cmpsd',
      'scasb', 'scasw', 'scasd', 'rep', 'repe', 'repz', 'repne', 'repnz',
      'finit', 'fld', 'fld1', 'fldz', 'fild', 'fst', 'fstp', 'fist',
      'fadd', 'fsub', 'fsubr', 'fmul', 'fdiv', 'fdivr',
      'fabs', 'fchs', 'fsqrt', 'frndint', 'ftst', 'fcomi', 'fcomp',
      'fclex', 'fwait', 'fincstp', 'fstcw', 'fstsw', 'fldcw', 'fnstsw',
    ],

    irvine: [
      'WriteString', 'WriteInt', 'WriteDec', 'WriteChar', 'WriteHex',
      'WriteHexB', 'WriteBin', 'WriteBinB', 'Crlf', 'ReadString',
      'ReadInt', 'ReadDec', 'ReadHex', 'ReadChar', 'ReadFloat',
      'WriteFloat', 'DumpRegs', 'DumpMem', 'Clrscr', 'WaitMsg',
      'Gotoxy', 'SetTextColor', 'GetTextColor', 'Delay', 'GetMseconds',
      'Random32', 'RandomRange', 'Randomize', 'StrLength', 'Str_length',
      'Str_copy', 'Str_compare', 'Str_trim', 'Str_ucase',
      'CreateOutputFile', 'OpenInputFile', 'CloseFile', 'ReadFromFile',
      'WriteToFile', 'WriteWindowsMsg', 'ParseInteger32', 'ParseDecimal32',
      'IsDigit', 'WriteStackFrame', 'WriteStackFrameName',
      'ShowFPUStack', 'ReadKey', 'ReadKeyFlush',
    ],

    macros: [
      'mWrite', 'mWriteLn', 'mWriteString', 'mWriteSpace',
      'mReadString', 'mGotoxy', 'mDump', 'mDumpMem', 'mShow',
    ],

    operators: [
      'EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'AND', 'OR', 'NOT',
    ],

    escapes: /\\(?:[0-7]{3}|x[0-9A-Fa-f]{2}|[abfnrtv\\"'])/,

    tokenizer: {
      root: [
        // Comments
        [/;.*$/, 'comment'],

        // Preprocessor/directives
        [/^(\s*)(INCLUDE|INCLUDELIB)(\s+)(\S+)/i, ['', 'keyword.control', '', 'string']],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@dstring' }],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, { token: 'string.quote', bracket: '@open', next: '@sstring' }],

        // Hex numbers
        [/[0-9][0-9A-Fa-f]*[hH]\b/, 'number.hex'],
        // Binary numbers
        [/[01]+[bB]\b/, 'number.binary'],
        // Octal
        [/[0-7]+[qQoO]\b/, 'number.octal'],
        // Decimal
        [/[0-9]+[dD]?\b/, 'number'],
        // Float
        [/[0-9]+\.[0-9]*([eE][+-]?[0-9]+)?/, 'number.float'],

        // Characters
        [/<[0-9]+>/, 'number'],

        // Identifiers
        [/[a-zA-Z_][a-zA-Z0-9_?@.]*/, {
          cases: {
            '@keywords': 'keyword',
            '@datatypes': 'type',
            '@registers': 'variable.language',
            '@instructions': 'keyword.operator',
            '@irvine': 'support.function',
            '@macros': 'support.function',
            '@operators': 'keyword',
            '@default': 'identifier',
          },
        }],

        // Operators
        [/[+\-*\/&|^~<>!=%?]/, 'operator'],
        [/[[\]{}(),.]/, 'delimiter'],
        [/\s+/, 'white'],
      ],

      dstring: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      sstring: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  monaco.languages.setLanguageConfiguration('masm', {
    comments: { lineComment: ';' },
    brackets: [['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '"', close: '"', notIn: ['string', 'comment'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '[', close: ']', notIn: ['string', 'comment'] },
      { open: '(', close: ')', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
  });
}
