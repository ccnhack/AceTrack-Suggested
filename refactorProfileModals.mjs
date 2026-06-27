import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'screens', 'ProfileScreen.js');
let src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

// Extract Modals
const checkoutContent = lines.slice(985, 1039).join('\n');
const supportContent = lines.slice(1042, 1069).join('\n');
const walletContent = lines.slice(1091, 1110).join('\n');
const referralContent = lines.slice(1113, 1128).join('\n');
const avatarContent = lines.slice(1132, 1283).join('\n');
const editProfileContent = lines.slice(1287, 1471).join('\n');
const changePasswordContent = lines.slice(1475, 1590).join('\n');

// 1. CheckoutModal
const checkoutJs = `import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const CheckoutModal = (props) => {
  const { checkoutModalVisible, setCheckoutModalVisible, isCheckingOut, handleWebCheckout, showDialog } = props;
  
  return (
${checkoutContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'CheckoutModal.js'), checkoutJs);

// 2. SupportModal
const supportJs = `import React from 'react';
import { View, TouchableOpacity, Modal, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SupportTicketSystem } from '../../components/SupportTicketSystem';
import styles from "../ProfileScreen.styles";

export const SupportModal = (props) => {
  const { showSupport, setShowSupport, currentUser, userTickets, handleCreateTicket, handleReplyToTicket, handleResolvePrompt, handleUpdateTicketStatus, handleRateTicket, handleMarkSeen } = props;
  
  return (
${supportContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'SupportModal.js'), supportJs);

// 3. WalletModal
const walletJs = `import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const WalletModal = (props) => {
  const { showWalletModal, setShowWalletModal, amountInput, setAmountInput, isProcessingPayment, setCheckoutModalVisible } = props;
  
  return (
${walletContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'WalletModal.js'), walletJs);

// 4. ReferralModal
const referralJs = `import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const ReferralModal = (props) => {
  const { showReferralModal, setShowReferralModal, referralCode, copyToClipboard } = props;
  
  return (
${referralContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'ReferralModal.js'), referralJs);

// 5. AvatarPickerModal
const avatarJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from '../../components/SafeAvatar';
import styles from "../ProfileScreen.styles";

export const AvatarPickerModal = (props) => {
  const { showAvatarPicker, setShowAvatarPicker, avatarThemes, activeAvatarCategory, setActiveAvatarCategory, getAvatarUrl, handleSaveAvatar, isSavingAvatar } = props;
  
  return (
${avatarContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'AvatarPickerModal.js'), avatarJs);

// 6. EditProfileModal
const editProfileJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const EditProfileModal = (props) => {
  const { showEditProfile, setShowEditProfile, editForm, setEditForm, handleSaveProfile, isSaving } = props;
  
  return (
${editProfileContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'EditProfileModal.js'), editProfileJs);

// 7. ChangePasswordModal
const changePasswordJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const ChangePasswordModal = (props) => {
  const { showChangePassword, setShowChangePassword, passwordForm, setPasswordForm, handleChangePassword, isChangingPassword, showPasswordMap, setShowPasswordMap } = props;
  
  return (
${changePasswordContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'profile', 'ChangePasswordModal.js'), changePasswordJs);

// Modify original file: replace blocks from bottom to top to preserve line numbers

lines.splice(1475, 116, 
  `      <ChangePasswordModal {...{ showChangePassword, setShowChangePassword, passwordForm, setPasswordForm, handleChangePassword, isChangingPassword, showPasswordMap, setShowPasswordMap }} />`
);

lines.splice(1287, 185, 
  `      <EditProfileModal {...{ showEditProfile, setShowEditProfile, editForm, setEditForm, handleSaveProfile, isSaving }} />`
);

lines.splice(1132, 152, 
  `      <AvatarPickerModal {...{ showAvatarPicker, setShowAvatarPicker, avatarThemes, activeAvatarCategory, setActiveAvatarCategory, getAvatarUrl, handleSaveAvatar, isSavingAvatar }} />`
);

lines.splice(1113, 16, 
  `      <ReferralModal {...{ showReferralModal, setShowReferralModal, referralCode, copyToClipboard }} />`
);

lines.splice(1091, 20, 
  `      <WalletModal {...{ showWalletModal, setShowWalletModal, amountInput, setAmountInput, isProcessingPayment, setCheckoutModalVisible }} />`
);

lines.splice(1042, 28, 
  `      <SupportModal {...{ showSupport, setShowSupport, currentUser, userTickets, handleCreateTicket, handleReplyToTicket, handleResolvePrompt, handleUpdateTicketStatus, handleRateTicket, handleMarkSeen }} />`
);

lines.splice(985, 55, 
  `      <CheckoutModal {...{ checkoutModalVisible, setCheckoutModalVisible, isCheckingOut, handleWebCheckout, showDialog }} />`
);

let newSrc = lines.join('\n');
newSrc = newSrc.replace("import AceDialog from '../components/AceDialog';", 
`import AceDialog from '../components/AceDialog';
import { CheckoutModal } from './profile/CheckoutModal';
import { SupportModal } from './profile/SupportModal';
import { WalletModal } from './profile/WalletModal';
import { ReferralModal } from './profile/ReferralModal';
import { AvatarPickerModal } from './profile/AvatarPickerModal';
import { EditProfileModal } from './profile/EditProfileModal';
import { ChangePasswordModal } from './profile/ChangePasswordModal';`
);

fs.writeFileSync(file, newSrc);
console.log("ProfileScreen refactor complete!");
