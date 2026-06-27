const fs = require('fs');
let content = fs.readFileSync('screens/SupportDashboardScreen.js', 'utf8');

// Find the first occurrence of SupportDashboardScreen
const compStart = content.indexOf('const SupportDashboardScreen = ({ navigation, route }) => {');
const endOfFirstBlock = content.indexOf('const SupportDashboardScreen = ({ navigation, route }) => {', compStart + 1);

// It seems there are TWO SupportDashboardScreen declarations! Let's check.
