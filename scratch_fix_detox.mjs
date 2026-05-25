import fs from 'fs';

let config = fs.readFileSync('.detoxrc.js', 'utf8');
config = config.replace(
  "build: 'xcodebuild -workspace ios/AceTrack.xcworkspace -scheme AceTrack -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build'",
  "build: 'xcodebuild -workspace ios/AceTrack.xcworkspace -scheme AceTrack -configuration Debug -destination \"platform=iOS Simulator,name=iPhone 15,OS=26.2\" -derivedDataPath ios/build'"
);

fs.writeFileSync('.detoxrc.js', config);
console.log('Fixed detox config');
