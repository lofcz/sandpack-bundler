/**
 * @jest-environment node
 *
 * Used-module closure: packages listed in CDN `ICDNModule.m` but omitted from
 * `/dep_tree` must still be fetched (e.g. `@swc/helpers` for transformed
 * `@tailwindcss/browser` on CDNs that inject external SWC helpers).
 */
import { ModuleRegistry } from './index';
import { fetchManifest, fetchModule } from './module-cdn';

jest.mock('./module-cdn', () => ({
  CDN_VERSION: 5,
  fetchManifest: jest.fn(),
  fetchModule: jest.fn(),
}));

const mockedFetchManifest = fetchManifest as jest.MockedFunction<typeof fetchManifest>;
const mockedFetchModule = fetchModule as jest.MockedFunction<typeof fetchModule>;

function stubBundler(): any {
  return {
    modules: new Map(),
    fs: { readFileAsync: jest.fn(), readBytesAsync: jest.fn() },
  };
}

describe('ModuleRegistry used-module closure', () => {
  beforeEach(() => {
    mockedFetchManifest.mockReset();
    mockedFetchModule.mockReset();
  });

  it('fetches packages listed in module.m that dep_tree omitted', async () => {
    mockedFetchManifest
      .mockResolvedValueOnce([{ n: '@tailwindcss/browser', v: '4.3.3', d: 0 }])
      .mockResolvedValueOnce([{ n: '@swc/helpers', v: '0.5.17', d: 1 }]);

    mockedFetchModule.mockImplementation(async (name: string, version: string) => {
      if (name === '@tailwindcss/browser') {
        return {
          f: {
            'dist/index.global.js': {
              c: 'var swcHelpers=require("@swc/helpers");module.exports={};',
              d: ['@swc/helpers'],
              t: true,
            },
          },
          m: ['@swc/helpers'],
        };
      }
      return {
        f: { 'index.js': { c: 'module.exports={};', d: [], t: true } },
        m: [],
      };
    });

    const registry = new ModuleRegistry(stubBundler());
    await registry.fetchManifest({ '@tailwindcss/browser': 'latest' }, false);
    await registry.preloadModules();

    expect(registry.modules.has('@tailwindcss/browser')).toBe(true);
    expect(registry.modules.has('@swc/helpers')).toBe(true);
    expect(mockedFetchManifest).toHaveBeenCalledTimes(2);
    expect(mockedFetchManifest.mock.calls[1][0]).toEqual({ '@swc/helpers': 'latest' });
    expect(registry.manifest.some((d) => d.n === '@swc/helpers')).toBe(true);
  });
});
