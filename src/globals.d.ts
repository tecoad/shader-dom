// Bundlers (Vite, webpack, etc.) replace `process.env.NODE_ENV` at build
// time. We don't ship @types/node in the package, so declare the minimal
// shape here once for the whole source tree.
declare const process: { env: { NODE_ENV: string } }
