import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findJsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      findJsFiles(path.join(dir, file), fileList);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allJsFiles = [...findJsFiles(path.join(__dirname, 'components')), ...findJsFiles(path.join(__dirname, 'screens')), ...findJsFiles(path.join(__dirname, 'context')), path.join(__dirname, 'App.js')];

let hasErrors = false;

for (const file of allJsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const importRegex = /import\s+(?:([^{;]+?)\s*,?)?\s*(?:\{([^}]+)\})?\s*from\s+['"]([^'"]+)['"]/g;
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    let defaultImport = match[1] ? match[1].trim() : null;
    let namedImports = match[2] ? match[2].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean) : [];
    const sourcePath = match[3];

    // Only check local imports
    if (sourcePath.startsWith('.')) {
      const resolvedPathBase = path.resolve(path.dirname(file), sourcePath);
      let resolvedPath = null;
      if (fs.existsSync(resolvedPathBase + '.js')) resolvedPath = resolvedPathBase + '.js';
      else if (fs.existsSync(resolvedPathBase + '.jsx')) resolvedPath = resolvedPathBase + '.jsx';
      else if (fs.existsSync(resolvedPathBase + '/index.js')) resolvedPath = resolvedPathBase + '/index.js';
      else if (fs.existsSync(resolvedPathBase)) {
         const stat = fs.statSync(resolvedPathBase);
         if (stat.isFile()) resolvedPath = resolvedPathBase;
      }
      
      if (!resolvedPath) {
        // Might be an asset or missing extension, ignore for now unless it looks like a component
        if (sourcePath.includes('components') || sourcePath.includes('screens')) {
           console.error(`[MISSING FILE] ${file} imports ${sourcePath} which does not exist`);
           hasErrors = true;
        }
        continue;
      }

      const targetContent = fs.readFileSync(resolvedPath, 'utf-8');
      
      // Remove comments to avoid false positives
      const cleanTarget = targetContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

      if (defaultImport) {
        const hasDefaultExport = /export\s+default\s+/.test(cleanTarget) || /module\.exports\s*=/.test(cleanTarget);
        if (!hasDefaultExport) {
          console.error(`[MISSING DEFAULT EXPORT] ${file} imports default from ${sourcePath}, but target has no default export`);
          hasErrors = true;
        }
      }

      for (const named of namedImports) {
        const hasNamedExport = new RegExp(`export\\s+(?:const|let|var|function|class)\\s+${named}\\b`).test(cleanTarget) || new RegExp(`export\\s+\\{[^}]*\\b${named}\\b[^}]*\\}`).test(cleanTarget);
        if (!hasNamedExport) {
          console.error(`[MISSING NAMED EXPORT] ${file} imports { ${named} } from ${sourcePath}, but it is not exported`);
          hasErrors = true;
        }
      }
    }
  }
}

if (!hasErrors) {
  console.log("All imports resolved successfully.");
}
