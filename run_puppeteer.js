const puppeteer = require('puppeteer-core');
const http = require('http');
const handler = require('serve-handler');

(async () => {
  const server = http.createServer((request, response) => {
    return handler(request, response, { public: 'dist' });
  });

  server.listen(3000, async () => {
    // Find Mac Chrome
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('LOG:', msg.text()));
    page.on('pageerror', err => console.log('ERROR:', err.message));
    
    await page.goto('http://localhost:3000');
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.close();
    server.close();
  });
})();
