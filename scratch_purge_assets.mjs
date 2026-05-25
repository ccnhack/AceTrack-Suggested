import fs from 'fs';
import path from 'path';

const OLD_VER = '2.6.550';
const NEW_VER = '2.6.551';

const dirs = ['backend/public', 'dist'];

function walkAndReplace(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkAndReplace(fullPath);
    } else if (stat.isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.json') || fullPath.endsWith('.html'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(OLD_VER)) {
        content = content.replace(new RegExp(OLD_VER, 'g'), NEW_VER);
        fs.writeFileSync(fullPath, content);
        console.log(`Purged old version in ${fullPath}`);
      }
    }
  }
}

for (const d of dirs) {
  walkAndReplace(d);
}
console.log('Asset purge complete.');
