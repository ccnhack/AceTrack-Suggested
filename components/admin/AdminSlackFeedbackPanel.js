import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

export default function AdminSlackFeedbackPanel({ onRefresh, onRefreshComplete }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'positive', 'negative'

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      setError('');
      
      let url = '/api/v1/infrastructure/slack-feedbacks?limit=50';
      if (activeTab === 'positive') url += '&status=positive';
      else if (activeTab === 'negative') url += '&status=negative';

      const ACE_API_KEY = localStorage.getItem('diag_token') || 'ACE_DIAG_998_2024';

      const response = await fetch(url, {
        headers: {
          'x-api-key': ACE_API_KEY
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setFeedbacks(data.feedbacks || []);
      } else {
        setError(data.error || 'Failed to fetch feedbacks');
      }
    } catch (err) {
      console.error('Fetch slack feedback error:', err);
      setError('Network request failed');
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [activeTab]);

  useEffect(() => {
    if (onRefresh) {
      fetchFeedbacks();
    }
  }, [onRefresh]);

  const tabs = [
    { id: 'all', label: 'All Feedback', icon: 'list' },
    { id: 'positive', label: 'Positive', icon: 'thumbs-up' },
    { id: 'negative', label: 'Negative', icon: 'thumbs-down' }
  ];

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <Ionicons name="chatbubbles" size={24} color="#8B5CF6" style={{ marginRight: 10 }} />
        <Text style={{ color: '#F8FAFC', fontSize: 22, fontWeight: '800' }}>Slack AI Feedbacks</Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 10,
                backgroundColor: isActive ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isActive ? 'rgba(139, 92, 246, 0.4)' : 'transparent',
              }}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? "#A78BFA" : "#64748B"} style={{ marginRight: 6 }} />
              <Text style={{ color: isActive ? '#E2E8F0' : '#64748B', fontWeight: isActive ? '700' : '500', fontSize: 13 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && feedbacks.length === 0 ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={{ color: '#94A3B8', marginTop: 12 }}>Loading feedbacks...</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 20, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <Text style={{ color: '#FCA5A5', textAlign: 'center' }}>{error}</Text>
        </View>
      ) : feedbacks.length === 0 ? (
        <View style={{ padding: 40, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color="#334155" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#94A3B8', fontSize: 15, fontWeight: '600' }}>No {activeTab !== 'all' ? activeTab : ''} feedback available.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {feedbacks.map((item, idx) => (
            <BlurView
              key={item._id || idx}
              intensity={20}
              tint="dark"
              style={{
                marginBottom: 12,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: item.isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                backgroundColor: item.isPositive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {item.isPositive ? (
                    <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', padding: 6, borderRadius: 8, marginRight: 10 }}>
                      <Ionicons name="thumbs-up" size={16} color="#10B981" />
                    </View>
                  ) : (
                    <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: 6, borderRadius: 8, marginRight: 10 }}>
                      <Ionicons name="thumbs-down" size={16} color="#EF4444" />
                    </View>
                  )}
                  <View>
                    <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '700' }}>
                      {item.userId || 'Unknown User'}
                    </Text>
                    <Text style={{ color: '#64748B', fontSize: 11 }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown Date'}
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', fontWeight: '700' }}>
                    {item.responseContext || 'General'}
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', marginBottom: 4 }}>ORIGINAL QUERY</Text>
                <Text style={{ color: '#E2E8F0', fontSize: 13, fontStyle: 'italic' }}>
                  "{item.query || 'N/A'}"
                </Text>
              </View>

              {!item.isPositive && item.feedbackText && (
                <View style={{ marginTop: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                  <Text style={{ color: '#FCA5A5', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>USER FEEDBACK</Text>
                  <Text style={{ color: '#FEF2F2', fontSize: 13 }}>
                    {item.feedbackText}
                  </Text>
                </View>
              )}
            </BlurView>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
