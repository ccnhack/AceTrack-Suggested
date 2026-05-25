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
    
    // Fix navigateToTab
    content = content.replace(
      /await waitFor\(element\(by\.id\(`nav\.tab\.\$\{tabName\}`\)\)\)\s*\.toBeVisible\(\)\s*\.withTimeout\(TIMEOUT\.MEDIUM\);\s*await element\(by\.id\(`nav\.tab\.\$\{tabName\}`\)\)\.tap\(\);/g,
      "await waitFor(element(by.id(`nav.tab.${tabName}`))).toBeVisible().withTimeout(TIMEOUT.MEDIUM);\n    await device.enableSynchronization();\n    await element(by.id(`nav.tab.${tabName}`)).tap();"
    );

    // Fix performLogout (remove stray alert taps that cause multiple interactions)
    content = content.replace(
      /try\s*\{\s*await element\(by\.text\('OK'\)\)\.tap\(\);\s*\}\s*catch\s*\(e\)\s*\{\}\s*try\s*\{\s*await element\(by\.text\('Close'\)\)\.tap\(\);\s*\}\s*catch\s*\(e\)\s*\{\}/g,
      ""
    );
    
    // Fix performLogout tap profile
    content = content.replace(
      /await waitFor\(element\(by\.id\('nav\.tab\.Profile'\)\)\)\s*\.toBeVisible\(\)\s*\.withTimeout\(TIMEOUT\.MEDIUM\);\s*await element\(by\.id\('nav\.tab\.Profile'\)\)\.tap\(\);/g,
      "await waitFor(element(by.id('nav.tab.Profile'))).toBeVisible().withTimeout(TIMEOUT.MEDIUM);\n    await device.enableSynchronization();\n    await element(by.id('nav.tab.Profile')).tap();"
    );

    // Fix zustand teardown (which had try/catch taps without await synchronization)
    content = content.replace(
      /try\s*\{\s*await element\(by\.id\('nav\.tab\.Profile'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}\s*try\s*\{\s*await element\(by\.id\('profile\.scrollview'\)\)\.scroll\(800,\s*'down'\);\s*await element\(by\.id\('profile\.logout\.button'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}/g,
      "await device.enableSynchronization();\n    try { await element(by.id('nav.tab.Profile')).tap(); } catch(e){}\n    try { await element(by.id('profile.scrollview')).scroll(800, 'down'); await element(by.id('profile.logout.button')).tap(); } catch(e){}"
    );

    // Fix waitlist teardown
    content = content.replace(
      /try\s*\{\s*await element\(by\.id\('profile\.scrollview'\)\)\.scroll\(800,\s*'down'\);\s*\}\s*catch\(e\)\{\}\s*try\s*\{\s*await element\(by\.id\('profile\.logout\.button'\)\)\.tap\(\);\s*\}\s*catch\(e\)\{\}/g,
      "await device.enableSynchronization();\n    try { await element(by.id('profile.scrollview')).scroll(800, 'down'); } catch(e){}\n    try { await element(by.id('profile.logout.button')).tap(); } catch(e){}"
    );

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', filePath);
    }
  }
});
