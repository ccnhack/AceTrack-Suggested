import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (!data.expo.plugins) {
  data.expo.plugins = [];
}

// Remove old ones
data.expo.plugins = data.expo.plugins.filter(p => {
  if (Array.isArray(p)) return p[0] !== 'expo-build-properties';
  return p !== 'expo-build-properties';
});

// Add with kotlinVersion 1.9.22
data.expo.plugins.push([
  "expo-build-properties",
  {
    "android": {
      "kotlinVersion": "1.9.22",
      "compileSdkVersion": 34,
      "targetSdkVersion": 34
    }
  }
]);

fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
console.log('App.json updated with kotlinVersion 1.9.22');
