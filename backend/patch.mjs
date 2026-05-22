import fs from 'fs';

const files = [
  'admin.test.mjs',
  'support.test.mjs',
  'occ_sync.test.mjs',
  'live_sync.test.mjs',
  'rate_limit.test.mjs',
  'invite.test.mjs'
];

for(let file of files) {
  let content = fs.readFileSync('tests/selenium/' + file, 'utf8');
  
  if(!content.includes('waitForSignal')) {
    content = content.replace(/import \{.*?\} from '\.\/utils\.mjs';/, (match) => {
      return match.replace('}', ', waitForSignal }');
    });
  }

  // Regex to match driver.wait(...) and driver1.wait(...) up to the semicolon
  content = content.replace(/await driver\.wait\([\s\S]*?\);/, 'await waitForSignal("Please interact with the Chrome window. Tell the agent in chat when you are done.");');
  content = content.replace(/await driver1\.wait\([\s\S]*?\);/, 'await waitForSignal("Please interact with BOTH Chrome windows. Tell the agent in chat when you are done.");');
  
  // Rate limit and invite tests might use sleep/loops instead of driver.wait
  // For rate limit and invite, the original didn't use driver.wait, it just did sleep loops.
  // I will manually replace those below if needed.

  fs.writeFileSync('tests/selenium/' + file, content);
}
