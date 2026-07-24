import { BundlerError } from './BundlerError';

interface IParsedError {
  message: string;
  line: number;
  column: number;
  path?: string;
}

const parseError = (error: any): IParsedError => {
  // Prefer an explicit path from shaped CSS / transform errors.
  const path =
    typeof error?.path === 'string' && error.path.length > 0
      ? error.path
      : typeof error?.loc?.filename === 'string' && error.loc.filename.length > 0
        ? error.loc.filename
        : undefined;

  if (error?.loc && typeof error.loc.line === 'number') {
    let column = typeof error.loc.column === 'number' ? error.loc.column : 1;
    // lightningcss uses 0-based columns when still on the raw error; shaped
    // errors already normalize to 1-based.
    if (column === 0) {
      column = 1;
    }
    return {
      message: typeof error.message === 'string' ? error.message : String(error),
      line: error.loc.line > 0 ? error.loc.line : 1,
      column: column > 0 ? column : 1,
      path,
    };
  }

  // "file:line:column" prefix some engines put in the message.
  const m =
    typeof error?.message === 'string'
      ? error.message.match(/^(.*?):(\d+):(\d+)\s*[-—:]?\s*(.*)$/s)
      : null;
  if (m) {
    return {
      message: error.message,
      line: Math.max(1, parseInt(m[2], 10) || 1),
      column: Math.max(1, parseInt(m[3], 10) || 1),
      path: path ?? (m[1].includes('/') || m[1].includes('\\') ? m[1] : undefined),
    };
  }

  return {
    message: typeof error?.message === 'string' ? error.message : String(error),
    line: 1,
    column: 1,
    path,
  };
};

export class CompilationError extends BundlerError {
  code = 'COMPILATION_ERROR';

  constructor(error: Error, path: string) {
    super(error.message);

    const parsed = parseError(error);

    this.title = 'Compilation error';
    this.message = parsed.message;
    this.column = parsed.column;
    this.line = parsed.line;
    this.path = parsed.path ?? path;
  }
}
