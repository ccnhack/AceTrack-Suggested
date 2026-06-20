import fs from 'fs';

const filePath = 'backend/routes/slack/index.mjs';
let content = fs.readFileSync(filePath, 'utf8');

// Fix dynamic imports path
content = content.replace(/await import\('\.\.\/models\/index\.mjs'\)/g, "await import('../../models/index.mjs')");
content = content.replace(/await import\('\.\.\/services\/scheduler\.mjs'\)/g, "await import('../../services/scheduler.mjs')");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed dynamic import paths in slack/index.mjs');
