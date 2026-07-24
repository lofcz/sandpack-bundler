import { CompilationError } from '../../../errors/CompilationError';
import { ITranspilationContext, ITranspilationResult, Transformer } from '../Transformer';
import type * as CssLoader from './css-loader';

/** Only invoke the CSS bundler when there is something to resolve/inline. */
const FEATURE_REGEX = /@import|url\(/i;

export class CSSTransformer extends Transformer {
  private _loader: null | Promise<typeof CssLoader> = null;

  constructor() {
    super('css-transformer');
  }

  getLoader(): Promise<typeof CssLoader> {
    if (this._loader) {
      return this._loader;
    }
    this._loader = import('./css-loader');
    return this._loader;
  }

  async transform(ctx: ITranspilationContext, _config: unknown): Promise<ITranspilationResult> {
    if (!FEATURE_REGEX.test(ctx.code ?? '')) {
      return {
        code: ctx.code,
        dependencies: new Set(),
      };
    }

    try {
      const loader = await this.getLoader();
      return await loader.default(ctx);
    } catch (err) {
      // Loader already returns CompilationError; this covers init/import failures.
      return new CompilationError(err as Error, ctx.module.filepath);
    }
  }
}
