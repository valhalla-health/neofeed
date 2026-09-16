import { build } from 'esbuild';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';import {fileURLToPath} from 'node:url';
mkdirSync(new URL('./dist/',import.meta.url),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./calculator-page.jsx',import.meta.url))],bundle:true,format:'esm',target:'es2022',outfile:fileURLToPath(new URL('./dist/calculator.js',import.meta.url)),minify:true,legalComments:'none',define:{'process.env.NODE_ENV':'"production"'}});
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
if(!styles)throw Error('Source calculator styles not found');
writeFileSync(new URL('./dist/calculator.css',import.meta.url),styles);
