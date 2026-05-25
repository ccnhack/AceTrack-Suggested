/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/AceTrack.app',
      build: 'xcodebuild -workspace ios/AceTrack.xcworkspace -scheme AceTrack -configuration Debug -destination "platform=iOS Simulator,name=iPhone 15,OS=26.2" -derivedDataPath ios/build'
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: '/tmp/app-debug.apk',
      testBinaryPath: '/tmp/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081]
    }
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15'
      }
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: 'emulator-5554'
      }
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_9_Pro'
      }
    }
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug'
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug'
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug'
    }
  }
};
