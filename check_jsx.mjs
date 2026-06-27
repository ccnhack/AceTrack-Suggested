import fs from 'fs';
import path from 'path';

const files = [
  'components/admin/support/ActionsModal.js',
  'components/admin/support/ActivityModal.js',
  'components/admin/support/AttendanceModal.js',
  'components/admin/support/DrillDownModal.js',
  'components/admin/support/ManagerSelectModal.js',
  'components/admin/shift/GroupedShiftCard.js',
  'components/admin/shift/OvertimeJustificationInput.js',
  'components/admin/shift/ShiftHistorySection.js',
  'components/tickets/TicketCreateView.js',
  'components/tickets/TicketDetailView.js',
  'components/tickets/TicketListView.js',
  'screens/matchmaking/ChallengeModal.js',
  'screens/matchmaking/CounterModal.js',
  'screens/matchmaking/DetailsModal.js',
  'screens/matchmaking/ReportScoreModal.js',
  'screens/profile/AvatarPickerModal.js',
  'screens/profile/ChangePasswordModal.js',
  'screens/profile/CheckoutModal.js',
  'screens/profile/EditProfileModal.js',
  'screens/profile/ReferralModal.js',
  'screens/profile/SupportModal.js',
  'screens/profile/WalletModal.js'
];

const nativeComponents = new Set(['View', 'Text', 'TouchableOpacity', 'ScrollView', 'TextInput', 'Image', 'Modal', 'SafeAreaView', 'KeyboardAvoidingView', 'ActivityIndicator', 'Alert', 'FlatList', 'Keyboard', 'RefreshControl', 'Switch', 'Button', 'SectionList', 'Ionicons', 'SafeAvatar', 'Swipeable', 'LinearGradient', 'Slider', 'BlurView', 'FlashList']);

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf-8');
  
  // Find all JSX tags
  const tags = new Set();
  const matches = content.match(/<([A-Z][a-zA-Z0-9]*)/g);
  if (matches) {
    matches.forEach(m => tags.add(m.substring(1)));
  }

  // Find all imports
  const imports = new Set();
  const importMatches = content.match(/import\s+.*?from\s+['"][^'"]+['"]/g);
  if (importMatches) {
    importMatches.forEach(imp => {
      const parts = imp.match(/import\s+(.*?)\s+from/);
      if (parts) {
        const names = parts[1].replace(/[{}]/g, '').split(',').map(s => s.trim());
        names.forEach(n => imports.add(n.split(/\s+as\s+/)[0]));
      }
    });
  }

  // Find props destructuring
  const propsMatch = content.match(/const\s+\{\s*([^}]+)\s*\}\s*=\s*props;/);
  const props = new Set();
  if (propsMatch) {
    propsMatch[1].split(',').forEach(p => props.add(p.trim()));
  }

  const missing = [];
  for (const tag of tags) {
    if (!imports.has(tag) && !props.has(tag) && tag !== 'Fragment') {
       // Is it defined in the file?
       if (!content.includes(`const ${tag}`) && !content.includes(`function ${tag}`) && !content.includes(`class ${tag}`)) {
           missing.push(tag);
       }
    }
  }

  if (missing.length > 0) {
    console.log(`[${file}] Missing imports for JSX:`, missing.join(', '));
  }
}
