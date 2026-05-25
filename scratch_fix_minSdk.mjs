import fs from 'fs';

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (!data.expo.plugins) {
  data.expo.plugins = [];
}

data.expo.plugins.push([
  "expo-build-properties",
  {
    "android": {
      "minSdkVersion": 24
    }
  }
]);

fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
console.log('App.json updated with minSdkVersion 24');
