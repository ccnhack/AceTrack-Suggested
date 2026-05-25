import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (!data.expo.plugins) {
  data.expo.plugins = [];
}

// Remove if exists
data.expo.plugins = data.expo.plugins.filter(p => {
  if (Array.isArray(p)) return p[0] !== 'expo-build-properties';
  return p !== 'expo-build-properties';
});

// Add with compileSdkVersion 33
data.expo.plugins.push([
  "expo-build-properties",
  {
    "android": {
      "compileSdkVersion": 33,
      "targetSdkVersion": 33
    }
  }
]);

fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
console.log('App.json updated');
