import React, { useState, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, Modal, SafeAreaView, Platform, KeyboardAvoidingView 
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { FullscreenVideoPlayer } from './FullscreenVideoPlayer';
import config from '../config';

export const CoachAnalysisView = ({ video, coach, onSaveComment, onClose }) => {
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [playbackStatus, setPlaybackStatus] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef(null);

  const handleAddComment = async () => {
    if (!newCommentText.trim() || !videoRef.current) return;
    
    // Get current time from playback status or status query
    const status = await videoRef.current.getStatusAsync();
    const timestampMs = status.positionMillis || 0;
    const timestamp = Math.floor(timestampMs / 1000);
    
    const minutes = Math.floor(timestamp / 60);
    const seconds = timestamp % 60;
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const newComment = {
      id: `c${Date.now()}`,
      videoId: video.id,
      coachId: coach.id,
      timestamp: formattedTime,
      text: newCommentText
    };

    setComments([...comments, newComment]);
    onSaveComment(newComment);
    setNewCommentText('');
  };

  const jumpToTime = (timeStr) => {
    if (!videoRef.current) return;
    const [mins, secs] = timeStr.split(':').map(Number);
    const positionMillis = ((mins * 60) + secs) * 1000;
    videoRef.current.setPositionAsync(positionMillis);
    videoRef.current.playAsync();
  };

  return (
    <Modal visible animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Coach Analysis Mode</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.flex}
        >
          <View style={styles.videoHost}>
            {video.adminStatus === 'Deletion Requested' ? (
              <View style={styles.reviewOverlay}>
                <Ionicons name="alert-circle" size={48} color="#F59E0B" style={{ marginBottom: 12 }} />
                <Text style={styles.reviewTitle}>Video Under Review</Text>
                <Text style={styles.reviewText}>
                  This video has been requested for deletion and is currently unavailable for analysis.
                </Text>
              </View>
            ) : (
              <>
                <Video
                  ref={videoRef}
                  style={styles.video}
                  source={{ uri: config.sanitizeUrl(video.watermarkedUrl || video.videoUrl) }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  onPlaybackStatusUpdate={status => setPlaybackStatus(() => status)}
                />
                <TouchableOpacity 
                  style={styles.expandTrigger}
                  onPress={() => setIsFullscreen(true)}
                >
                  <Ionicons name="expand" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                {video.watermarkedUrl && (
                  <Text style={styles.watermark}>@AceTrack</Text>
                )}
              </>
            )}
          </View>

          <View style={styles.content}>
            <View style={styles.inputArea}>
              <Text style={styles.label}>Add Feedback</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  placeholder="Enter comment at current time..."
                  placeholderTextColor="#64748B"
                  style={styles.input}
                />
                <TouchableOpacity onPress={handleAddComment} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent}>
              <Text style={styles.label}>Timestamped Notes</Text>
              {comments.length === 0 ? (
                <Text style={styles.emptyText}>No comments yet</Text>
              ) : (
                comments.map(c => (
                  <View key={c.id} style={styles.commentCard}>
                    <TouchableOpacity 
                      onPress={() => jumpToTime(c.timestamp)}
                      style={styles.timestampBtn}
                    >
                      <Ionicons name="play" size={10} color="#EF4444" />
                      <Text style={styles.timestampText}>{c.timestamp}</Text>
                    </TouchableOpacity>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {isFullscreen && (
        <FullscreenVideoPlayer
          visible={isFullscreen}
          videoUrl={config.sanitizeUrl(video.watermarkedUrl || video.videoUrl)}
          onClose={() => setIsFullscreen(false)}
          initialStatus={playbackStatus}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  closeBtn: {
    padding: 4,
  },
  videoHost: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
  },
  video: {
    flex: 1,
  },
  expandTrigger: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 12,
    zIndex: 10,
  },
  watermark: {
    position: 'absolute',
    bottom: 40,
    right: 16,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  inputArea: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  label: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentList: {
    flex: 1,
  },
  commentListContent: {
    padding: 20,
  },
  emptyText: {
    color: '#475569',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
  commentCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timestampBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  timestampText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '900',
  },
  commentText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20,
  },
});
