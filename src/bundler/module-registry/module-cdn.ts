import { decode as decodeMsgPack } from '@msgpack/msgpack';
import urlJoin from 'url-join';

import { retryFetch, registerImmutableUrlPrefix } from '../../utils/fetch';
import { DepMap } from '.';

// Package CDN root. Prefer build-time SANDPACK_CDN_ROOT (Parcel inlines
// `process.env.*`). When unset, derive from the bundler document URL so a
// Priprava-hosted build at `/sandpack-bundler/` automatically hits the sibling
// `/sandpack-cdn/` reverse-proxy — absolute URLs only (opaque-origin iframe).
const FALLBACK_CDN_ROOT = 'https://sandpack-cdn-staging.blazingly.io/';

function normalizeCdnRoot(root: string): string {
  return root.endsWith('/') ? root : `${root}/`;
}

function resolveCdnRoot(): string {
  const fromEnv = process.env.SANDPACK_CDN_ROOT;
  if (fromEnv && fromEnv.length > 0) return normalizeCdnRoot(fromEnv);
  try {
    // Use href, not location.origin — sandboxed opaque origins report "null".
    const u = new URL(self.location.href);
    return `${u.origin}/sandpack-cdn/`;
  } catch {
    return FALLBACK_CDN_ROOT;
  }
}

let cdnRootCached: string | null = null;

/** Lazily resolve + register the immutable `/package/` prefix once. */
function cdnRoot(): string {
  if (cdnRootCached) return cdnRootCached;
  cdnRootCached = resolveCdnRoot();
  // /package/<name@exact-version> never changes for a given URL → cache-first.
  // /dep_tree/ is NOT registered: it resolves semver ranges and can change.
  registerImmutableUrlPrefix(urlJoin(cdnRootCached, '/package/'));
  return cdnRootCached;
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
