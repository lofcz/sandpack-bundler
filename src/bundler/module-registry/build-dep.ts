// Build-time-only dependency filtering now lives in @lofcz/transpiler
// (the single source of truth shared with the CLI's lockset derivation,
// PRETRANSPILED_ARTIFACTS_SPEC §4.4). Re-exported here so existing importers keep
// their path.
export { filterBuildDeps, isBuildDep } from '@lofcz/transpiler';
