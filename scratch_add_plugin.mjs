import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (!data.expo.plugins) {
  data.expo.plugins = [];
}
if (!data.expo.plugins.includes('@config-plugins/detox')) {
  data.expo.plugins.push('@config-plugins/detox');
}
fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
console.log('Plugin added');
