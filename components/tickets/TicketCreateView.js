import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../tickets/SupportTicketSystem.styles";

const TICKET_TYPES = [
  'Technical Issue', 'Bug', 'Refund', 'Enhancement Request',
  'Fraud Report', 'Match Recordings', 'Payment Issue', 'Tournament Issue', 'Other'
];

export const TicketCreateView = (props) => {
  const {
    setView, formData, setFormData, showTypePicker, setShowTypePicker, handleCreate
  } = props;
  

    return (
      <View style={styles.container}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.title}>Raise a Ticket</Text>
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Issue Type</Text>
                <TouchableOpacity 
                    onPress={() => setShowTypePicker(true)}
                    style={styles.picker}
                >
                    <Text style={styles.pickerText}>{formData.type}</Text>
                    <Ionicons name="chevron-down" size={16} color="#64748B" />
                </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                    value={formData.title}
                    onChangeText={t => setFormData(p => ({ ...p, title: t }))}
                    placeholder="Brief summary of the issue"
                    style={styles.input}
                    maxLength={100}
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                    value={formData.description}
                    onChangeText={d => setFormData(p => ({ ...p, description: d }))}
                    placeholder="Describe the issue in detail..."
                    style={[styles.input, styles.textArea]}
                    multiline
                    numberOfLines={5}
                    maxLength={500}
                />
                <Text style={styles.charCount}>{formData.description.length}/500</Text>
            </View>

            <TouchableOpacity 
                onPress={handleCreate}
                disabled={!formData.title.trim() || !formData.description.trim()}
                style={[styles.submitBtn, (!formData.title.trim() || !formData.description.trim()) && styles.submitBtnDisabled]}
            >
                <Text style={styles.submitBtnText}>Submit Ticket</Text>
            </TouchableOpacity>
        </ScrollView>

        <Modal transparent visible={showTypePicker} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Select Issue Type</Text>
                        <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        {TICKET_TYPES.map((type) => (
                            <TouchableOpacity 
                                key={type} 
                                onPress={() => {
                                    setFormData(p => ({ ...p, type }));
                                    setShowTypePicker(false);
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, formData.type === type && styles.pickerItemTextActive]}>{type}</Text>
                                {formData.type === type && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>

        {/* 👤 [AGENT_PICKER_MODAL] (v2.6.451) */}
        <Modal transparent visible={showAgentPicker} animationType="fade">
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowAgentPicker(false)}
            >
                <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Filter by Agent</Text>
                        <TouchableOpacity onPress={() => setShowAgentPicker(false)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        <TouchableOpacity 
                            onPress={() => {
                                setFilterAgentId(null);
                                setShowAgentPicker(false);
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[styles.pickerItemText, !filterAgentId && styles.pickerItemTextActive]}>All Team Members</Text>
                            {!filterAgentId && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                        </TouchableOpacity>
                        {availableAgents.map((agent) => (
                            <TouchableOpacity 
                                key={agent.id} 
                                onPress={() => {
                                    setFilterAgentId(agent.id);
                                    setShowAgentPicker(false);
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, filterAgentId === agent.id && styles.pickerItemTextActive]}>{agent.name}</Text>
                                {filterAgentId === agent.id && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
      </View>
    );
};
