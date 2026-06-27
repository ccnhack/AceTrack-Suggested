import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, StyleSheet, Animated } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useAdminCoreStore } from '../../../stores/useAdminCoreStore';
import { useAuth } from '../../../context/AuthContext';
import SafeAvatar from '../../SafeAvatar';
import config from '../../../config';
import storage from '../../../utils/storage';
import { apiFetch } from '../../../utils/apiFetch';

const OvertimeJustificationInput = ({ shiftLogId, initialValue = '', initialStatus = 'pending_justification' }) => {
    const [justification, setJustification] = useState(initialValue);
    const [loading, setLoading] = useState(false);
    const [submittedText, setSubmittedText] = useState(initialStatus === 'justified' ? initialValue : '');

    const handleSubmit = async () => {
        if (!justification?.trim() || loading) return;
        setLoading(true);
        try {
            const token = await storage.getItem('userToken');
            const res = await apiFetch(`${config.API_BASE_URL}/api/v1/admin-core/overtime-justify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ shiftLogId, justification })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSubmittedText(justification);
            } else {
                alert(data.message || 'Failed to submit justification');
            }
        } catch (e) {
            alert('Error submitting justification');
        } finally {
            setLoading(false);
        }
    };

    if (submittedText) {
        return (
            <View style={{ marginTop: 8, backgroundColor: 'rgba(16,185,129,0.05)', padding: 8, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#10B981' }}>
                <Text style={{ color: '#A7F3D0', fontSize: 11, fontWeight: '600' }}>OT Justified: "{submittedText}"</Text>
            </View>
        );
    }

    return (
        <View style={{ marginTop: 8, padding: 10, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
            <Text style={{ color: '#FCA5A5', fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 }}>PENDING OVERTIME JUSTIFICATION</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                    value={justification}
                    onChangeText={setJustification}
                    placeholder="Enter reason for overtime..."
                    placeholderTextColor="#9CA3AF"
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', color: '#F8FAFC', fontSize: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                />
                <TouchableOpacity 
                    onPress={handleSubmit}
                    disabled={loading || !justification?.trim()}
                    style={{ marginLeft: 8, backgroundColor: justification?.trim() ? '#EF4444' : 'rgba(239,68,68,0.3)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 }}
                >
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{loading ? '...' : 'Submit'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

/* ═══════════════════════════════════════════════════════════ */
/* 🃏 SHIFT CARD SUB-COMPONENT                                */
/* ═══════════════════════════════════════════════════════════ */

export default OvertimeJustificationInput;
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }
});

