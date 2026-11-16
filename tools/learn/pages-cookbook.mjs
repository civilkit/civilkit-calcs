// The landing pages of the Cookbook samples. Each page is written in its own module (cb-<name>.mjs) that exports a function
// taking the shared helpers of pages.mjs ({ V, tbl, notCode, taskSteps }) and returning one page entry of the same shape.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NAMES = ['pid', 'filter', 'robot', 'rsa'];

export async function cookbookPages(helpers) {
    const out = [];
    for (const n of NAMES) {
        const file = join(here, `cb-${n}.mjs`);
        if (existsSync(file)) out.push((await import(file)).default(helpers));
    }
    return out;
}
