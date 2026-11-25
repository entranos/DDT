// The vendored libraries in /vendor are classic scripts that define globals.
// Modules reach them through here so tests can provide them under Node.
export const lib = {
  get d3 () { return globalThis.d3 },
  get XLSX () { return globalThis.XLSX },
  get yaml () { return globalThis.jsyaml }
}
