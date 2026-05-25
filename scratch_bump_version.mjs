import fs from 'fs';

const OLD_VER = '2.6.550';
const NEW_VER = '2.6.551';

const files = [
  'app.json',
  'App.js',
  'config.js',
  'backend/server.mjs'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(new RegExp(OLD_VER, 'g'), NEW_VER);
    fs.writeFileSync(file, content);
    console.log(`Bumped version in ${file}`);
  } else {
    console.warn(`File ${file} not found!`);
  }
}
