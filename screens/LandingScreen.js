import { Platform } from 'react-native';
import LandingIOS from './LandingScreen.ios';
import LandingAndroid from './LandingScreen.android';

// 🍎 DEFAULT TO iOS FOR WEB (Premium Aesthetic)
const LandingScreen = Platform.OS === 'android' ? LandingAndroid : LandingIOS;

export default LandingScreen;
