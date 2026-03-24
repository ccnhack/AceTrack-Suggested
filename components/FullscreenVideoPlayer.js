import React, { useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, 
  Modal, SafeAreaView, Dimensions, StatusBar 
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const FullscreenVideoPlayer = ({ 
  visible, 
  videoUrl, 
  onClose, 
  initialStatus = {},
  onPlaybackStatusUpdate
}) => {
  useEffect(() => {
    if (visible) {
      // Lock to landscape when modal opens
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    
    return () => {
      // Revert to portrait (or default) when modal closes
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.container}>
        <StatusBar hidden />
        
        <View style={styles.videoHost}>
          <Video
            style={styles.video}
            source={{ uri: videoUrl }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            status={initialStatus}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />
          
          <View style={styles.watermarkContainer} pointerEvents="none">
            <Text style={styles.watermark}>@AceTrack</Text>
          </View>

          <TouchableOpacity 
            onPress={onClose} 
            style={styles.closeBtn}
            activeOpacity={0.7}
          >
            <View style={styles.closeIconBg}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoHost: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  watermarkContainer: {
    position: 'absolute',
    bottom: 50, // Above native controls
    right: 40,
    zIndex: 100,
  },
  watermark: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 101,
  },
  closeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  }
});
