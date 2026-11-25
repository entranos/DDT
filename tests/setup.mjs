// Makes the vendored browser libraries available to modules under Node.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
globalThis.XLSX = require('../shared/vendor/xlsx-0.18.12.full.min.js')
globalThis.jsyaml = require('../shared/vendor/js-yaml-4.1.0.min.js')
