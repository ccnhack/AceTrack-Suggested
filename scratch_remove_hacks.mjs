import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (data.expo.plugins) {
  data.expo.plugins = data.expo.plugins.filter(p => {
    if (Array.isArray(p)) return p[0] !== 'expo-build-properties';
    return p !== 'expo-build-properties';
  });
}
fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
console.log('App.json restored to pure defaults');
