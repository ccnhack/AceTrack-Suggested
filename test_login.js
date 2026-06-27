const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });

  try {
    // We can't log in locally if it points to the production backend and gets CORS errors.
    // Wait, CORS error only prevents API calls. Maybe we can spoof the local storage!
  } catch(e) {
    console.error(e);
  }
  await browser.close();
})();
