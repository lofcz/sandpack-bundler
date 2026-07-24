import { CompilationError } from '../../../errors/CompilationError';
import { shapeCssEngineError } from './css-error';

describe('shapeCssEngineError', () => {
  it('formats lightningcss-shaped loc into a clear CSS diagnostic', () => {
    const raw = Object.assign(new Error('Unexpected token Ident("default")'), {
      loc: { filename: '/app/styles.css', line: 2, column: 7 },
    });
    const shaped = shapeCssEngineError(raw, '/app/fallback.css');
    expect(shaped.message).toMatch(/^CSS error in \/app\/styles\.css:2:8 —/);
    expect(shaped.loc).toEqual({ line: 2, column: 8 });
    expect(shaped.path).toBe('/app/styles.css');

    const compileErr = new CompilationError(shaped, '/app/fallback.css');
    expect(compileErr.path).toBe('/app/styles.css');
    expect(compileErr.line).toBe(2);
    expect(compileErr.column).toBe(8);
    expect(compileErr.message).toContain('CSS error in');
  });

  it('annotates unresolved import failures', () => {
    const shaped = shapeCssEngineError(
      new Error('Cannot resolve CSS import "./missing.css" from /app/a.css: not found'),
      '/app/a.css'
    );
    expect(shaped.message).toMatch(/unresolved CSS @import/);
  });
});
