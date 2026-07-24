import initLightningcss, { bundleAsync } from 'lightningcss-wasm';
// Parcel `url:` → fetchable asset URL (string). Do NOT import the .wasm as an
// ES module: Sandpack's opaque-origin iframe + import maps then hit the host
// SPA HTML fallback ("MIME type of text/html").
// @ts-expect-error Parcel url: scheme resolves to a string URL at build time.
import lightningcssWasmUrl from 'url:lightningcss-wasm/lightningcss_node.wasm';

import { CompilationError } from '../../../errors/CompilationError';
import { extractModuleSpecifierParts, isModuleSpecifier } from '../../../resolver/utils/module-specifier';
import { dirname, join as joinPaths } from '../../../utils/path';
import { ITranspilationContext, ITranspilationResult } from '../Transformer';
import { shapeCssEngineError } from './css-error';

let initPromise: Promise<void> | null = null;

function ensureLightningcss(): Promise<void> {
  if (!initPromise) {
    // Pass an absolute URL so lightningcss-wasm uses fetch/instantiateStreaming
    // instead of a module-script import of the .wasm file.
    const wasmUrl =
      typeof lightningcssWasmUrl === 'string' && /^(https?:|blob:|data:)/i.test(lightningcssWasmUrl)
        ? lightningcssWasmUrl
        : new URL(String(lightningcssWasmUrl), self.location.href).href;
    initPromise = initLightningcss(wasmUrl);
  }
  return initPromise;
}

async function resolveCSSFile(
  ctx: ITranspilationContext,
  path: string,
  basePath: string
): Promise<string> {
  const isDependency = isModuleSpecifier(path);

  if (isDependency) {
    const parts = extractModuleSpecifierParts(path);
    if (!parts.filepath.length) {
      // Prefer package.json "style" field when present.
      try {
        const pkgJsonPath = await ctx.module.bundler.resolveAsync(
          joinPaths(path, 'package.json'),
          basePath,
          []
        );
        const content = await ctx.module.bundler.fs.readFileAsync(pkgJsonPath);
        const parsedPkg = JSON.parse(content);

        if (typeof parsedPkg.style === 'string' && parsedPkg.style.length > 0) {
          path = joinPaths(path, parsedPkg.style);
        }
      } catch {
        /* fall through to .css resolve */
      }
    }
  }

  return ctx.module.bundler.resolveAsync(path, basePath, ['.css']);
}

function toCompilationError(err: unknown, fallbackPath: string): CompilationError {
  const shaped = shapeCssEngineError(err, fallbackPath);
  return new CompilationError(shaped, shaped.path ?? fallbackPath);
}

/**
 * Bundle CSS with lightningcss-wasm: modern syntax + generic @import resolution
 * against the Sandpack FS/resolver. Failures become CompilationError (no crash).
 */
export default async function cssLoader(ctx: ITranspilationContext): Promise<ITranspilationResult> {
  const entryPath = ctx.module.filepath;
  const dependencies = new Set<string>();

  try {
    await ensureLightningcss();

    const result = await bundleAsync({
      filename: entryPath,
      minify: false,
      resolver: {
        read: async (filePath: string) => {
          if (filePath === entryPath) {
            return ctx.code ?? '';
          }
          dependencies.add(filePath);
          return ctx.module.bundler.fs.readFileAsync(filePath);
        },
        resolve: async (specifier: string, originatingFile: string) => {
          if (/^https?:\/\//i.test(specifier) || specifier.startsWith('data:')) {
            return { external: specifier };
          }
          const base = dirname(originatingFile) || '/';
          try {
            return await resolveCSSFile(ctx, specifier, base);
          } catch (resolveErr) {
            const msg =
              resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
            const err = new Error(
              `Cannot resolve CSS import ${JSON.stringify(specifier)} from ${originatingFile}: ${msg}`
            ) as Error & { loc?: { filename: string; line: number; column: number } };
            err.loc = { filename: originatingFile, line: 1, column: 0 };
            throw err;
          }
        },
      },
    });

    const code = new TextDecoder().decode(result.code);
    return { code, dependencies };
  } catch (err) {
    return toCompilationError(err, entryPath);
  }
}
