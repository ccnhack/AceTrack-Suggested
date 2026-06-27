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

import OvertimeJustificationInput from './OvertimeJustificationInput';
import GroupedShiftCard from './GroupedShiftCard';

const ShiftHistorySection = ({ allSupportAgents }) => {
  const [historyData, setHistoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Date range state
  const today = new Date();
  const todayStr = formatDateISO(today);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [dateMode, setDateMode] = useState('single'); // 'single' or 'range'

  // Display format state (for the text inputs)
  const [startDateDisplay, setStartDateDisplay] = useState(formatDateDDMMYYYY(todayStr));
  const [endDateDisplay, setEndDateDisplay] = useState(formatDateDDMMYYYY(todayStr));

  // Employee filter
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Calendar Modal state
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState(null); // 'start' or 'end'

  // View Mode: daily, weekly, monthly
  const [viewMode, setViewMode] = useState('daily');

  const fetchHistory = useCallback(async (sDate, eDate, userId) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await storage.getItem('userToken');
      const headers = {
        'x-user-id': 'admin',
        'x-ace-api-key': config.ACE_API_KEY || config.PUBLIC_APP_ID
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let url = `${config.API_BASE_URL}/api/v1/admin-core/shift-history?startDate=${sDate}`;
      if (eDate && eDate !== sDate) url += `&endDate=${eDate}`;
      if (userId) url += `&userId=${userId}`;

      const res = await apiFetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.message || 'Failed to fetch shift history');
      }
    } catch (e) {
      setError('Network error fetching shift history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time synchronization
  const statusHash = useMemo(() => {
    return allSupportAgents.map(a => `${a.id}:${a.shiftStatus}:${a.shiftCheckinRounded}:${a.shortLeaves?.length || 0}`).join('|');
  }, [allSupportAgents]);

  useEffect(() => {
    // Re-fetch automatically if data is currently visible and the global state of players changes
    if (isExpanded) {
      fetchHistory(startDate, endDate, selectedEmployee?.id || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusHash]);

  // Quick date presets
  const getQuickDates = useCallback(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push({
        label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        date: formatDateISO(d),
        displayDate: formatDateDDMMYYYY(formatDateISO(d))
      });
    }
    return dates;
  }, []);

  const handleQuickDate = (dateStr) => {
    setDateMode('single');
    setStartDate(dateStr);
    setEndDate(dateStr);
    setStartDateDisplay(formatDateDDMMYYYY(dateStr));
    setEndDateDisplay(formatDateDDMMYYYY(dateStr));
    fetchHistory(dateStr, dateStr, selectedEmployee?.id || null);
  };

  const handleApplyDateRange = () => {
    const isoStart = parseDDMMYYYYToISO(startDateDisplay);
    const isoEnd = parseDDMMYYYYToISO(endDateDisplay);
    if (!isoStart) { setError('Invalid start date. Use DD-MM-YYYY.'); return; }
    if (dateMode === 'range' && !isoEnd) { setError('Invalid end date. Use DD-MM-YYYY.'); return; }
    setStartDate(isoStart);
    setEndDate(isoEnd || isoStart);
    setError(null);
    fetchHistory(isoStart, isoEnd || isoStart, selectedEmployee?.id || null);
  };

  const handleEmployeeSelect = (agent) => {
    setSelectedEmployee(agent);
    setShowEmployeeDropdown(false);
    setEmployeeSearch('');
    if (startDate) fetchHistory(startDate, endDate, agent?.id || null);
  };

  const handleClearEmployee = () => {
    setSelectedEmployee(null);
    if (startDate) fetchHistory(startDate, endDate, null);
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!historyData?.shifts?.length) return;
    const rows = [['Date', 'Employee', 'Email', 'Level', 'Manager', 'Check-In', 'Check-Out', 'Duration', 'Overtime', 'Early Checkout', 'Auto Checkout', 'Justification']];
    for (const s of historyData.shifts) {
      const dur = s.totalShiftMs != null ? `${Math.floor(s.totalShiftMs / 3600000)}h ${Math.floor((s.totalShiftMs % 3600000) / 60000)}m` : 'In Progress';
      const ot = s.overtimeMs > 0 ? `${Math.floor(s.overtimeMs / 60000)}m` : '—';
      rows.push([
        formatDateDDMMYYYY(s.date),
        s.name,
        s.email,
        s.supportLevel,
        s.managerName || '—',
        s.checkinTime ? new Date(s.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
        s.checkoutTime ? new Date(s.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
        dur,
        ot,
        s.isEarlyCheckout ? 'Yes' : 'No',
        s.isAutoCheckout ? 'Yes' : 'No',
        s.justification || '—'
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    if (typeof window !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const rangeLabel = startDate === endDate ? formatDateDDMMYYYY(startDate) : `${formatDateDDMMYYYY(startDate)}_to_${formatDateDDMMYYYY(endDate)}`;
      a.download = `shift_history_${rangeLabel}${selectedEmployee ? `_${selectedEmployee.name.replace(/\s+/g, '_')}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const quickDates = getQuickDates();
  const filteredEmployees = (allSupportAgents || []).filter(a =>
    !employeeSearch || a.name?.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // Group shifts by date for range view
  const groupedShifts = useMemo(() => {
    if (!historyData?.shifts) return {};
    const groups = {};
    for (const s of historyData.shifts) {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    }
    return groups;
  }, [historyData]);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', overflow: 'hidden' }}>
      {/* Header */}
      <TouchableOpacity
        onPress={() => { setIsExpanded(!isExpanded); if (!isExpanded && !historyData) fetchHistory(startDate, endDate, selectedEmployee?.id || null); }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}
      >
        <Ionicons name="calendar-outline" size={18} color="#6366F1" style={{ marginRight: 8 }} />
        <Text style={{ color: '#F8FAFC', fontSize: 15, fontWeight: '900', flex: 1 }}>Shift History</Text>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          {/* Date Mode Toggle */}
          <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
            <TouchableOpacity
              onPress={() => setDateMode('single')}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: dateMode === 'single' ? '#6366F1' : 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: dateMode === 'single' ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
            >
              <Text style={{ color: dateMode === 'single' ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: '700' }}>Single Day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDateMode('range')}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: dateMode === 'range' ? '#6366F1' : 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: dateMode === 'range' ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
            >
              <Text style={{ color: dateMode === 'range' ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: '700' }}>Date Range</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Date Chips */}
          {dateMode === 'single' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {quickDates.map(qd => {
                  const isSelected = startDate === qd.date && dateMode === 'single';
                  return (
                    <TouchableOpacity
                      key={qd.date}
                      onPress={() => handleQuickDate(qd.date)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isSelected ? '#6366F1' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: isSelected ? '#818CF8' : 'rgba(255,255,255,0.1)' }}
                    >
                      <Text style={{ color: isSelected ? '#FFF' : '#CBD5E1', fontSize: 11, fontWeight: '700' }}>{qd.label}</Text>
                      <Text style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : '#64748B', fontSize: 9, fontWeight: '600', marginTop: 2 }}>{qd.displayDate}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Custom Date Inputs */}
          {dateMode === 'range' && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748B', fontSize: 9, fontWeight: '700', marginBottom: 4 }}>FROM (DD-MM-YYYY)</Text>
                <TouchableOpacity
                  onPress={() => { setCalendarTarget('start'); setShowCalendar(true); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: startDateDisplay ? '#F8FAFC' : '#475569', fontSize: 13, fontWeight: '600' }}>
                    {startDateDisplay || "DD-MM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#475569" style={{ marginTop: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748B', fontSize: 9, fontWeight: '700', marginBottom: 4 }}>TO (DD-MM-YYYY)</Text>
                <TouchableOpacity
                  onPress={() => { setCalendarTarget('end'); setShowCalendar(true); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: endDateDisplay ? '#F8FAFC' : '#475569', fontSize: 13, fontWeight: '600' }}>
                    {endDateDisplay || "DD-MM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleApplyDateRange}
                style={{ marginTop: 16, backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              >
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>Go</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Employee Filter */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <Ionicons name="person-outline" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                <Text style={{ color: selectedEmployee ? '#F8FAFC' : '#64748B', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {selectedEmployee ? selectedEmployee.name : 'All Employees'}
                </Text>
                <Ionicons name={showEmployeeDropdown ? 'chevron-up' : 'chevron-down'} size={14} color="#64748B" />
              </TouchableOpacity>
              {selectedEmployee && (
                <TouchableOpacity onPress={handleClearEmployee} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
              {/* Export Button */}
              {historyData?.shifts?.length > 0 && (
                <TouchableOpacity
                  onPress={handleExportCSV}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
                >
                  <Ionicons name="download-outline" size={14} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800' }}>CSV</Text>
                </TouchableOpacity>
              )}
            </View>

          {/* View Mode Toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 16 }}>
            {['Daily', 'Weekly', 'Monthly'].map(mode => {
              const lowerMode = mode.toLowerCase();
              return (
                <TouchableOpacity
                  key={lowerMode}
                  onPress={() => setViewMode(lowerMode)}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: viewMode === lowerMode ? '#6366F1' : 'transparent', borderRadius: 8 }}
                >
                  <Text style={{ color: viewMode === lowerMode ? '#FFF' : '#94A3B8', fontSize: 11, fontWeight: '800' }}>{mode}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Employee Dropdown */}
          {showEmployeeDropdown && (
            <View style={{ marginTop: 8, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', maxHeight: 200, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
                  <Ionicons name="search" size={14} color="#64748B" />
                  <TextInput
                    value={employeeSearch}
                    onChangeText={setEmployeeSearch}
                    placeholder="Search..."
                    placeholderTextColor="#475569"
                    style={{ flex: 1, marginLeft: 8, color: '#F8FAFC', fontSize: 13 }}
                    autoFocus
                  />
                </View>
                <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                  <TouchableOpacity
                    onPress={() => handleEmployeeSelect(null)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: !selectedEmployee ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                  >
                    <Ionicons name="people" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '600' }}>All Employees</Text>
                  </TouchableOpacity>
                  {filteredEmployees.map(agent => (
                    <TouchableOpacity
                      key={agent.id}
                      onPress={() => handleEmployeeSelect(agent)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: selectedEmployee?.id === agent.id ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                    >
                      <SafeAvatar uri={agent.avatar} name={agent.name} role={agent.role} size={20} borderRadius={6} />
                      <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>{agent.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '600' }}>{error}</Text>
            </View>
          )}

          {/* Loading */}
          {isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600' }}>Loading shift history...</Text>
            </View>
          )}

          {/* Summary Stats */}
          {!isLoading && historyData?.summary && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' }}>
                <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>TOTAL SHIFTS</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{historyData.summary.totalShifts}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.totalWorkers} employees</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
                <Text style={{ color: '#34D399', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>AVG DURATION</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{formatDuration(historyData.summary.avgDurationMs)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.completedShifts} completed</Text>
              </View>
              <View style={{ flex: 1, minWidth: 100, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                <Text style={{ color: '#F87171', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>OVERTIME</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 }}>{formatDuration(historyData.summary.totalOvertimeMs)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>{historyData.summary.earlyCheckouts} early exits</Text>
              </View>
            </View>
          )}

          {/* Shift Cards or Summary */}
          {!isLoading && historyData && (
            <View>
              {historyData.shifts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                  <Ionicons name="calendar-clear-outline" size={24} color="#475569" />
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 8 }}>No shift records found for this period</Text>
                </View>
              ) : viewMode === 'daily' ? (
                Object.keys(groupedShifts).sort((a, b) => b.localeCompare(a)).map(dateKey => (
                  <View key={dateKey} style={{ marginBottom: 16 }}>
                    {/* Date Header */}
                    {Object.keys(groupedShifts).length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Ionicons name="calendar" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#C7D2FE', fontSize: 12, fontWeight: '800' }}>{formatDateDDMMYYYY(dateKey)}</Text>
                        <Text style={{ color: '#475569', fontSize: 10, fontWeight: '600', marginLeft: 8 }}>({groupedShifts[dateKey].length} shifts)</Text>
                      </View>
                    )}
                    {(() => {
                        const employeeGroups = {};
                        groupedShifts[dateKey].forEach(s => {
                            if (!employeeGroups[s.userId]) employeeGroups[s.userId] = [];
                            employeeGroups[s.userId].push(s);
                        });
                        return Object.values(employeeGroups).map(shifts => (
                            <GroupedShiftCard key={shifts[0].userId} shifts={shifts} />
                        ));
                    })()}
                  </View>
                ))
              ) : (
                (() => {
                  const groups = {};
                  historyData.shifts.forEach(s => {
                    let groupKey = s.shiftDate;
                    if (viewMode === 'weekly') {
                      const d = new Date(s.shiftDate);
                      const day = d.getDay() || 7;
                      d.setDate(d.getDate() - day + 1);
                      groupKey = `Week of ${formatDateDDMMYYYY(formatDateISO(d))}`;
                    } else if (viewMode === 'monthly') {
                      const d = new Date(s.shiftDate);
                      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      groupKey = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
                    }
                    if (!groups[groupKey]) groups[groupKey] = {};
                    if (!groups[groupKey][s.userId]) {
                      const baseUser = allSupportAgents.find(a => a.id === s.userId) || { id: s.userId, name: 'Unknown', avatar: null };
                      groups[groupKey][s.userId] = { user: baseUser, shifts: 0, totalMs: 0, activeMs: 0, breakMs: 0, overtimeMs: 0 };
                    }
                    const stat = groups[groupKey][s.userId];
                    stat.shifts += 1;
                    stat.totalMs += s.totalShiftMs || 0;
                    stat.activeMs += s.activeDurationMs || 0;
                    stat.breakMs += s.totalBreakMs || 0;
                    stat.overtimeMs += s.overtimeMs || 0;
                  });

                  return Object.keys(groups).sort((a,b) => b.localeCompare(a)).map(dateKey => (
                    <View key={dateKey} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Ionicons name="calendar" size={12} color="#10B981" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#A7F3D0', fontSize: 12, fontWeight: '800' }}>{dateKey}</Text>
                      </View>
                      {Object.values(groups[dateKey]).map(stat => (
                        <View key={stat.user.id} style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center' }}>
                          <SafeAvatar uri={stat.user.avatar} name={stat.user.name} size={32} borderRadius={8} />
                          <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700' }}>{stat.user.name}</Text>
                            <Text style={{ color: '#64748B', fontSize: 10 }}>{stat.shifts} shift{stat.shifts !== 1 ? 's' : ''}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Text style={{ color: '#818CF8', fontSize: 11, fontWeight: '700' }}>Total: {formatDuration(stat.totalMs)}</Text>
                            <Text style={{ color: '#34D399', fontSize: 10, fontWeight: '600' }}>Active: {formatDuration(stat.activeMs)}</Text>
                            {stat.overtimeMs > 0 && <Text style={{ color: '#F87171', fontSize: 9, fontWeight: '800' }}>OT: {formatDuration(stat.overtimeMs)}</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  ));
                })()
              )}
            </View>
          )}
        </View>
      )}

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 350, padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                Select {calendarTarget === 'start' ? 'Start' : 'End'} Date
              </Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Calendar
              current={calendarTarget === 'start' ? parseDDMMYYYYToISO(startDateDisplay) : parseDDMMYYYYToISO(endDateDisplay)}
              maxDate={formatDateISO(new Date())}
              onDayPress={(day) => {
                const selectedIso = day.dateString;
                const formattedDate = formatDateDDMMYYYY(selectedIso);
                if (calendarTarget === 'start') {
                  setStartDateDisplay(formattedDate);
                } else {
                  setEndDateDisplay(formattedDate);
                }
                setShowCalendar(false);
              }}
              theme={{
                todayTextColor: '#6366F1',
                arrowColor: '#6366F1',
                textDayFontWeight: '500',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: 'bold'
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════ */
/* 🛠️ OVERTIME JUSTIFICATION COMPONENT                       */
/* ═══════════════════════════════════════════════════════════ */

export default ShiftHistorySection;
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }
});

