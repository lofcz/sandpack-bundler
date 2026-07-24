/** Normalize lightningcss / resolver failures into an Error with Babel-like `loc`. */
export function shapeCssEngineError(
  err: unknown,
  fallbackPath: string
): Error & { loc?: { line: number; column: number }; path?: string } {
  const anyErr = err as {
    message?: string;
    loc?: { filename?: string; line?: number; column?: number };
    fileName?: string;
  };

  const path =
    (typeof anyErr?.loc?.filename === 'string' && anyErr.loc.filename) ||
    (typeof anyErr?.fileName === 'string' && anyErr.fileName) ||
    fallbackPath;

  const line = Number(anyErr?.loc?.line) > 0 ? Number(anyErr.loc!.line) : 1;
  // lightningcss columns are 0-based; CompilationError / overlay expect 1-based.
  const rawCol = anyErr?.loc?.column;
  const column =
    typeof rawCol === 'number' && Number.isFinite(rawCol) ? Math.max(1, rawCol + 1) : 1;

  let detail = typeof anyErr?.message === 'string' ? anyErr.message : String(err);
  detail = detail.replace(/^Error:\s*/i, '').trim();

  if (/failed to resolve|cannot find|ENOENT|missing|Cannot resolve CSS import/i.test(detail)) {
    detail = `${detail} (unresolved CSS @import or url())`;
  }

  const message = `CSS error in ${path}:${line}:${column} — ${detail}`;
  const out = new Error(message) as Error & {
    loc?: { line: number; column: number };
    path?: string;
  };
  out.loc = { line, column };
  out.path = path;
  return out;
}
