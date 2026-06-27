import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Define the major refactored files and their new homes
const refactors = [
  {
    legacy: 'components/SupportTicketSystem.js',
    newFiles: [
      'components/SupportTicketSystem.js',
      'components/tickets/SupportTicketSystem.styles.js',
      'components/tickets/TicketCreateView.js',
      'components/tickets/TicketDetailView.js',
      'components/tickets/TicketListView.js'
    ]
  },
  {
    legacy: 'components/admin/AdminSupportTeamPanel.js',
    newFiles: [
      'components/admin/AdminSupportTeamPanel.js',
      'components/admin/AdminSupportTeamPanel.styles.js',
      'components/admin/support/ActionsModal.js',
      'components/admin/support/ActivityModal.js',
      'components/admin/support/AttendanceModal.js',
      'components/admin/support/DrillDownModal.js',
      'components/admin/support/ManagerSelectModal.js'
    ]
  },
  {
    legacy: 'components/admin/AdminShiftManagementPanel.js',
    newFiles: [
      'components/admin/AdminShiftManagementPanel.js',
      'components/admin/shift/GroupedShiftCard.js',
      'components/admin/shift/OvertimeJustificationInput.js',
      'components/admin/shift/ShiftHistorySection.js'
    ]
  },
  {
    legacy: 'screens/ProfileScreen.js',
    newFiles: [
      'screens/ProfileScreen.js',
      'screens/profile/ProfileScreen.styles.js',
      'screens/profile/AvatarPickerModal.js',
      'screens/profile/ChangePasswordModal.js',
      'screens/profile/CheckoutModal.js',
      'screens/profile/EditProfileModal.js',
      'screens/profile/ReferralModal.js',
      'screens/profile/SupportModal.js',
      'screens/profile/WalletModal.js'
    ]
  },
  {
    legacy: 'screens/MatchmakingScreen.js',
    newFiles: [
      'screens/MatchmakingScreen.js',
      'screens/matchmaking/MatchmakingScreen.styles.js',
      'screens/matchmaking/ChallengeModal.js',
      'screens/matchmaking/CounterModal.js',
      'screens/matchmaking/DetailsModal.js',
      'screens/matchmaking/ReportScoreModal.js'
    ]
  }
];

function cleanCode(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*/g, '')          // Remove single-line comments
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
}

for (const task of refactors) {
  console.log(`\nAnalyzing refactor for: ${task.legacy}`);
  
  try {
    // Get legacy code from the git tag
    const legacyCodeRaw = execSync(`git show Checkpoint_Stable_26th_June:${task.legacy}`).toString();
    const legacyClean = cleanCode(legacyCodeRaw);
    
    // Get combined new code from HEAD
    let newCodeRaw = '';
    for (const file of task.newFiles) {
      if (fs.existsSync(file)) {
         newCodeRaw += fs.readFileSync(file, 'utf-8') + '\n';
      } else {
         console.warn(`  [WARNING] Expected new file ${file} does not exist in HEAD.`);
      }
    }
    const newClean = cleanCode(newCodeRaw);
    
    // Check for major logic blocks (apiFetch endpoints, specific alert messages, state variables)
    // Extract strings that look like API endpoints or significant logic
    const extractKeywords = (code) => {
       const keywords = new Set();
       const matches = code.match(/apiFetch\(['"`](.*?)['"`]/g);
       if (matches) {
          matches.forEach(m => keywords.add(m));
       }
       // Find unique function definitions
       const fnMatches = code.match(/const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g);
       if (fnMatches) {
          fnMatches.forEach(m => keywords.add(m.trim()));
       }
       return Array.from(keywords);
    };
    
    const legacyKeywords = extractKeywords(legacyClean);
    let missing = 0;
    
    console.log(`  Extracted ${legacyKeywords.length} key structural signatures from legacy file.`);
    
    for (const kw of legacyKeywords) {
       // Escape special chars for regex
       const escapedKw = kw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
       if (!new RegExp(escapedKw).test(newClean)) {
          console.error(`  [MISSING LOGIC] ${kw}`);
          missing++;
       }
    }
    
    if (missing === 0) {
      console.log(`  ✅ All logic signatures perfectly preserved in the modularized files.`);
    } else {
      console.error(`  ❌ Found ${missing} logic signatures that failed to map to the new files!`);
    }

  } catch (e) {
    console.error(`  Error analyzing ${task.legacy}: ${e.message}`);
  }
}
