import fs from 'node:fs';

import { DEFAULT_MAX_CONCURRENT_NODES } from '#installation/config/schema.js';

import { PROJECT_CONFIG_VERSION } from './schema.js';

const DEFAULT_PROJECT_CONFIG = `
# Project configuration
version: ${PROJECT_CONFIG_VERSION}

# Worktree runs copy no gitignored files and run no hooks by default.
# Uncomment and adjust to prepare each run's worktree:
#
# worktree:
#   include: ['.env']          # gitignored files to copy in (an allowlist)
#   exclude: []                # dropped from a broad include, e.g. node_modules/**
#   hook:                      # bash files in hooks/ beside this file, named
#     post-create:             #   relative to it and rendered as templates
#       - install.sh           # blocking and fail-closed; runs before any node
#     pre-remove:              # best-effort; runs at prune before the worktree is removed
#       - stop-db.sh
#     post-remove:             # best-effort; runs at prune after the worktree is removed
#       - cleanup.sh

# run:
#   max_concurrent_nodes: ${DEFAULT_MAX_CONCURRENT_NODES}   # how many nodes run at once (overrides the global value)
`.trimStart();

export function createDefaultProjectConfig(projectConfigPath: string): void {
  fs.writeFileSync(projectConfigPath, DEFAULT_PROJECT_CONFIG, { flag: 'wx' });
}
