import { decode as decodeMsgPack } from '@msgpack/msgpack';
import urlJoin from 'url-join';

import { retryFetch, registerImmutableUrlPrefix } from '../../utils/fetch';
import { DepMap } from '.';

// Package CDN root — self-hosted only (Priprava `/sandpack-cdn/`). Never a
// public third-party CDN. Resolution order:
//  1) {@link setCdnRoot} from the parent `register-frame` handshake (preferred;
//     opaque-origin iframes cannot reliably derive a host from location)
//  2) build-time `SANDPACK_CDN_ROOT` (Parcel inlines `process.env.*`)
//  3) sibling of the bundler document URL (`…/sandpack-bundler/` → `…/sandpack-cdn/`)

function normalizeCdnRoot(root: string): string {
  return root.endsWith('/') ? root : `${root}/`;
}

let cdnRootCached: string | null = null;

/**
 * Pin the CDN root from the host handshake. Must run before the first
 * `/dep_tree` or `/package` fetch.
 */
export function setCdnRoot(root: string): void {
  if (!root || typeof root !== 'string') {
    throw new Error('setCdnRoot: expected a non-empty sandpack CDN URL');
  }
  cdnRootCached = normalizeCdnRoot(root);
  // /package/<name@exact-version> never changes for a given URL → cache-first.
  // /dep_tree/ is NOT registered: it resolves semver ranges and can change.
  registerImmutableUrlPrefix(urlJoin(cdnRootCached, '/package/'));
}

function resolveCdnRoot(): string {
  if (cdnRootCached) return cdnRootCached;
  const fromEnv = process.env.SANDPACK_CDN_ROOT;
  if (fromEnv && fromEnv.length > 0) {
    setCdnRoot(fromEnv);
    return cdnRootCached!;
  }
  try {
    // Use href, not location.origin — sandboxed opaque origins report "null".
    const u = new URL(self.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      setCdnRoot(`${u.origin}/sandpack-cdn/`);
      return cdnRootCached!;
    }
  } catch {
    // fall through
  }
  throw new Error(
    'Sandpack CDN root not configured. The host must pass sandpackCdnRoot on register-frame ' +
      '(Priprava /sandpack-cdn/), or set SANDPACK_CDN_ROOT at bundler build time.',
  );
}

/** Lazily resolve + register the immutable `/package/` prefix once. */
function cdnRoot(): string {
  return resolveCdnRoot();
}

export interface IResolvedDependency {
  // name
  n: string;
  // version
  v: string;
  // depth
  d: number;
}

// Exported so the lockset check (lockset.ts) can reject locksets resolved
// against a different CDN protocol version.
export const CDN_VERSION = 5;

function encodePayload(payload: string): string {
  return btoa(`${CDN_VERSION}(${payload})`);
}

export async function fetchManifest(deps: DepMap): Promise<IResolvedDependency[]> {
  const encoded_manifest = encodePayload(JSON.stringify(deps));
  const result = await retryFetch(urlJoin(cdnRoot(), `/dep_tree/${encoded_manifest}`), {
    maxRetries: 5,
    retryDelay: 1000,
  });
  const buffer = await result.arrayBuffer();
  return decodeMsgPack(buffer) as IResolvedDependency[];
}

export type CDNModuleFileType = ICDNModuleFile | number;

export interface ICDNModuleFile {
  // content
  c: string;
  // dependencies
  d: string[];
  // is transpiled
  t: boolean;
}

export interface ICDNModule {
  // files
  f: Record<string, CDNModuleFileType>;
  // transient dependencies
  m: string[];
}

export async function fetchModule(name: string, version: string): Promise<ICDNModule> {
  const specifier = `${name}@${version}`;
  const encoded_specifier = encodePayload(specifier);
  const result = await retryFetch(urlJoin(cdnRoot(), `/package/${encoded_specifier}`), { maxRetries: 5 });
  const buffer = await result.arrayBuffer();
  return decodeMsgPack(buffer) as ICDNModule;
}
