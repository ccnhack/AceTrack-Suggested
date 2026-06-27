import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from '../../components/SafeAvatar';
import { AvatarPlaceholder } from '../../components/ProfileHeader';
import styles from "./ProfileScreen.styles";

export const AvatarPickerModal = (props) => {
  const { 
    showAvatarPicker, setShowAvatarPicker, user, onUpdateUser,
    pickImage, allAvatars, editAvatar, setEditAvatar,
    isPickingImage, isUploading, setIsUploading,
    logger, Platform, activeApiUrl, storage, config,
    setSessionCustomAvatar, normalizeAvatarUrl
  } = props;
  
  return (
        <Modal visible={showAvatarPicker} animationType="fade" transparent={true} onRequestClose={() => setShowAvatarPicker(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.editModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Change Profile Picture</Text>
                <TouchableOpacity onPress={() => setShowAvatarPicker(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>Choose Avatar</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarGrid}>
                    <TouchableOpacity onPress={pickImage} style={styles.avatarOption}>
                      <View style={[styles.avatarOptionImage, { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="add" size={24} color="#94A3B8" />
                      </View>
                    </TouchableOpacity>

                    {allAvatars.map((url, idx) => (
                      <TouchableOpacity 
                        key={`avatar_opt_${idx}`} 
                        onPress={() => setEditAvatar(url)}
                        style={[styles.avatarOption, editAvatar === url && styles.avatarOptionSelected]}
                      >
                        {url.includes('ui-avatars.com') ? (
                           <AvatarPlaceholder name={user.name} size={56} />
                        ) : (
                           <SafeAvatar 
                             uri={url} 
                             name={user?.name}
                             size={56}
                             borderRadius={28}
                             style={styles.avatarOptionImage} 
                           />
                        )}
                        {editAvatar === url && (
                          <View style={styles.selectedCheck}>
                            <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  <TouchableOpacity style={styles.uploadImageBtn} onPress={pickImage} disabled={isPickingImage}>
                    <Ionicons name={isPickingImage ? "hourglass-outline" : "image-outline"} size={20} color="#3B82F6" />
                    <Text style={styles.uploadImageText}>{isPickingImage ? "Opening Gallery..." : "Upload from Gallery"}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  onPress={async () => {
                    let finalAvatar = editAvatar;
                    if (editAvatar && (editAvatar.startsWith('file://') || editAvatar.startsWith('content://') || editAvatar.startsWith('data:') || editAvatar.startsWith('blob:'))) {
                      setIsUploading(true);
                      const uriToLog = editAvatar.startsWith('data:') ? `[base64 data:${editAvatar.length} bytes]` : editAvatar;
                      logger.logAction('AVATAR_UPLOAD_START', { localUri: uriToLog });
                      try {
                        const formData = new FormData();
                        
                        if (Platform.OS === 'web' && editAvatar.startsWith('data:')) {
                          const arr = editAvatar.split(',');
                          const mime = arr[0].match(/:(.*?);/)[1] || 'image/jpeg';
                          const bstr = atob(arr[1]);
                          let n = bstr.length;
                          const u8arr = new Uint8Array(n);
                          while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                          const blob = new Blob([u8arr], {type:mime});
                          formData.append('video', blob, `avatar_${user.id || 'new'}.jpg`);
                        } else if (Platform.OS === 'web' && editAvatar.startsWith('blob:')) {
                          const res = await fetch(editAvatar);
                          const blob = await res.blob();
                          formData.append('video', blob, `avatar_${user.id || 'new'}.jpg`);
                        } else {
                          formData.append('video', { 
                            uri: editAvatar, 
                            name: `avatar_${user.id || 'new'}.jpg`, 
                            type: 'image/jpeg' 
                          });
                        }
                        
                        const token = await storage.getItem('userToken');
                        const response = await fetch(`${activeApiUrl}/api/upload`, {
                          method: 'POST',
                          body: formData,
                          headers: { 
                            'x-ace-api-key': config.PUBLIC_APP_ID,
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                          },
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const data = await response.json();
                          // Append a cache-buster so React Native knows the remote image actually changed
                          const cacheBustedUrl = `${data.url}${data.url.includes('?') ? '&' : '?'}v=${Date.now()}`;
                          finalAvatar = cacheBustedUrl;
                          setSessionCustomAvatar(cacheBustedUrl); // Persist in picker for session
                          
                          // 🛡️ PERSISTENCE HARDENING: Update Avatar History
                          const updatedHistory = [cacheBustedUrl, ...(user?.avatarHistory || [])]
                            .filter((url, idx, self) => self.findIndex(u => normalizeAvatarUrl(u) === normalizeAvatarUrl(url)) === idx)
                            .slice(0, 10);

                          onUpdateUser({ 
                            ...user, 
                            avatar: cacheBustedUrl, 
                            lastCustomAvatar: cacheBustedUrl,
                            avatarHistory: updatedHistory
                          });
                          
                          logger.logAction('AVATAR_UPLOAD_SUCCESS', { cloudUrl: cacheBustedUrl });
                        } else {
                          const errorText = await response.text();
                          logger.logAction('AVATAR_UPLOAD_FAIL', { status: response.status, error: errorText });
                          Alert.alert("Upload Failed", "Could not sync your image to the cloud. Please try again or use a prebuilt avatar.");
                          setIsUploading(false);
                          return; // DO NOT SAVE LOCAL URI TO CLOUD
                        }
                      } catch (e) { 
                        logger.logAction('AVATAR_UPLOAD_ERROR', { error: e.message });
                        Alert.alert("Connection Error", "Network issue while uploading image.");
                        setIsUploading(false);
                        return; 
                      }
                      finally { setIsUploading(false); }
                    }
                      logger.logAction('PROFILE_UPDATE_FINAL', { userId: user.id, avatar: finalAvatar });
                      
                      // 🛡️ PERSISTENCE HARDENING: Update Avatar History on final selection
                      const finalHistory = [finalAvatar, ...(user?.avatarHistory || [])]
                        .filter((url, idx, self) => self.findIndex(u => normalizeAvatarUrl(u) === normalizeAvatarUrl(url)) === idx)
                        .slice(0, 10);

                      onUpdateUser({ ...user, avatar: finalAvatar, avatarHistory: finalHistory });
                      setShowAvatarPicker(false);
                      Alert.alert("Success", "Profile picture updated!");
                  }}
                  style={[styles.saveBtn, isUploading && { opacity: 0.5 }]}
                  disabled={isUploading}
                >
                  <Text style={styles.saveBtnText}>{isUploading ? "Uploading..." : "Update Picture"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
  );
};
