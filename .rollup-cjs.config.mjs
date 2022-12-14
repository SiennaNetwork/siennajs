import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import pkg from './package.json' assert { type: 'json' }

export const file = `bundles/${pkg.name}-${pkg.version}.cjs.bundle.js`

export default {
  input: 'index.dist.js',
  output: { file, format: 'cjs' },
  plugins: [json(), commonjs(), nodeResolve()]
}
