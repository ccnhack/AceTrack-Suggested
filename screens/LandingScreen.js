import { Platform } from 'react-native';
import LandingIOS from './LandingScreen.ios';
import LandingAndroid from './LandingScreen.android';
import LandingWeb from './LandingScreen.web';

// 🍎 CONTEXT-AWARE ROUTING
// - Web: Premium Management Dashboard
// - Android: Original Mobile Experience
// - iOS: Original Mobile Experience
const LandingScreen = Platform.select({
  web: LandingWeb,
  android: LandingAndroid,
  default: LandingIOS,
});

export default LandingScreen;
