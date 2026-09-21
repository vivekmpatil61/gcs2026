import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const htmlFiles = ['index.html', 'admin.html'];
let failures = 0;

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const idSet = new Set(ids);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
  const missingAnchors = [...new Set(anchors.filter(id => !idSet.has(id)))];
  const localAssets = [...html.matchAll(/(?:src|href)="(\/gcs-website\/assets\/[^"]+)"/g)]
    .map(match => match[1]);
  const missingAssets = [...new Set(localAssets.filter(asset => !existsSync(path.join('.', asset))))];
  const unsafeBlankLinks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => !/rel="[^"]*noopener[^"]*"/.test(tag));

  report(file, 'duplicate IDs', duplicateIds);
  report(file, 'missing section targets', missingAnchors);
  report(file, 'missing local assets', missingAssets);
  report(file, 'new-tab links without noopener', unsafeBlankLinks);

  if (!duplicateIds.length && !missingAnchors.length && !missingAssets.length && !unsafeBlankLinks.length) {
    console.log(`✓ ${file}: ${ids.length} IDs, ${anchors.length} section links and ${localAssets.length} local assets verified`);
  }
}

if (failures) process.exit(1);
console.log('✓ Site verification passed');

function report(file, label, values) {
  if (!values.length) return;
  failures += values.length;
  console.error(`✗ ${file} has ${label}: ${values.join(', ')}`);
}
