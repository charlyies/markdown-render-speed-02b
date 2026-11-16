// Driver for the markdown-render-speed entry: reads every case from
// /input/cases.json, renders each one alone with parse() from parse.js,
// and writes /output/html.json as a JSON array of the HTML strings,
// one per case and in the cases' order. Outside a container the
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR environment variables
// stand in for /input and /output.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8'));
const html = new Array(cases.length);
for (let i = 0; i < cases.length; i++) html[i] = parse(cases[i].markdown);
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
