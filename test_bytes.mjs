import fs from 'fs';
const lines = fs.readFileSync('screens/AdminHubScreen.js', 'utf8').split('\n');
const line970 = lines[969];
console.log("Line 970:");
console.log(line970);
console.log(Array.from(line970).map(c => c.charCodeAt(0)));
