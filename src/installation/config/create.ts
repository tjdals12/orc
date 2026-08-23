import fs from 'node:fs';

import { GLOBAL_CONFIG_VERSION, DEFAULT_MAX_CONCURRENT_NODES } from './schema.js';

const DEFAULT_CONFIG = `
# Global configuration
version: ${GLOBAL_CONFIG_VERSION}

# Defaults every project inherits; a project's config.yml overrides per key.
#
# run:
#   max_concurrent_nodes: ${DEFAULT_MAX_CONCURRENT_NODES}   # how many nodes run at once
`.trimStart();

export function createDefaultConfig(configPath: string): void {
  fs.writeFileSync(configPath, DEFAULT_CONFIG, { flag: 'wx' });
}
