import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./e2e', function(filePath) {
  if (filePath.endsWith('.js')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Disable manual synchronization toggling completely
    content = content.replace(/await device\.disableSynchronization\(\);/g, '// await device.disableSynchronization();');
    content = content.replace(/await device\.enableSynchronization\(\);/g, '// await device.enableSynchronization();');
    
    // Fix stray alerts logic which causes multiple interactions
    content = content.replace(/try\s*\{\s*await element\(by\.text\('OK'\)\)\.tap\(\);\s*\}\s*catch\s*\(e\)\s*\{\}/g, '');
    content = content.replace(/try\s*\{\s*await element\(by\.text\('Close'\)\)\.tap\(\);\s*\}\s*catch\s*\(e\)\s*\{\}/g, '');
    
    // Fix zustand_mutation.test.js dangerous teardown
    content = content.replace(/try\s*\{\s*await element\(by\.id\('nav\.tab\.Profile'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}/g, '');
    content = content.replace(/try\s*\{\s*await element\(by\.id\('profile\.scrollview'\)\)\.scroll\(800,\s*'down'\);\s*await element\(by\.id\('profile\.logout\.button'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}/g, '');
    
    // Fix waitlist_promotion.test.js dangerous teardown
    content = content.replace(/try\s*\{\s*await element\(by\.id\('profile\.scrollview'\)\)\.scroll\(800,\s*'down'\);\s*\}\s*catch\(e\)\{\}/g, '');
    content = content.replace(/try\s*\{\s*await element\(by\.id\('profile\.logout\.button'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}/g, '');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', filePath);
    }
  }
});
