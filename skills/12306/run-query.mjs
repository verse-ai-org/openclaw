#!/usr/bin/env node
import('./scripts/query.mjs').then(m => {
  process.argv.splice(1, 1); // remove this wrapper's path
  // Just trigger the module to run - it uses parseArgs at top level
}).catch(console.error);