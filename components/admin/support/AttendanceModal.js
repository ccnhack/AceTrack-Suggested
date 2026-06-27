import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import PureJSDateTimePicker from '../../PureJSDateTimePicker';
import styles from "../AdminSupportTeamPanel.styles";

export const AttendanceModal = (props) => {
  const {
    showAttendanceModal, setShowAttendanceModal, attendanceData, selectedAgentId, isLoadingAttendance,
    fetchAttendance, attendanceRangeMode, attendanceDateFilter, attendanceEndDateFilter,
    getLocalDateString, selectedAgent, calendarMonth, setCalendarMonth, attendanceCalendarMode,
    setAttendanceCalendarMode, selectedLeaveDate, setSelectedLeaveDate, setAttendanceRangeMode,
    setShowDatePicker, setShowEndDatePicker, showDatePicker, showEndDatePicker,
    setAttendanceDateFilter, setAttendanceEndDateFilter
  } = props;
  
  return (
      <Modal visible={showAttendanceModal} transparent animationType="slide" onRequestClose={() => setShowAttendanceModal(false)}>
        <View style={styles.attendanceModalOverlay}>
          <View style={styles.attendanceModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance & Working Hours</Text>
              <TouchableOpacity onPress={() => setShowAttendanceModal(false)}>
                <Ionicons name="close-circle" size={28} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {(() => {
              const agentAttendance = attendanceData?.find(a => String(a.id) === String(selectedAgentId));
              if (!agentAttendance && isLoadingAttendance) {
                return (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={{ marginTop: 12, color: '#64748B', fontWeight: '600' }}>Fetching records...</Text>
                  </View>
                );
              }
              if (!agentAttendance) {
                return (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#64748B', fontWeight: '600' }}>No attendance data available.</Text>
                    <TouchableOpacity onPress={fetchAttendance} style={{ marginTop: 12, padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}>
                      <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Retry Sync</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              // Compute stats for selected date or range
              const isTodayFilter = !attendanceRangeMode && attendanceDateFilter === getLocalDateString();
              
              const dateSessions = (agentAttendance.allSessions || []).filter(s => {
                const sDate = getLocalDateString(s.startTime);
                if (attendanceRangeMode) {
                  return sDate >= attendanceDateFilter && sDate <= attendanceEndDateFilter;
                }
                return sDate === attendanceDateFilter;
              });

              // Add live sessions to today's count if today is within filter
              let totalMsForDate = dateSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
              let liveSessionDocs = [];
              const todayStr = getLocalDateString();
              const isTodayInRange = attendanceRangeMode 
                ? (todayStr >= attendanceDateFilter && todayStr <= attendanceEndDateFilter)
                : (todayStr === attendanceDateFilter);

              if (isTodayInRange && agentAttendance.isCurrentlyOnline) {
                liveSessionDocs = agentAttendance.activeSessions || [];
                totalMsForDate += liveSessionDocs.reduce((sum, s) => sum + (s.durationMs || 0), 0);
              }

              const displaySessions = [...liveSessionDocs, ...dateSessions.reverse()];
              const dateHours = Math.floor(totalMsForDate / 3600000);
              const dateMins = Math.floor((totalMsForDate % 3600000) / 60000);
              const dateProgress = Math.min((totalMsForDate / (8 * 3600000)) * 100, 100);
              const maxWeeklyMs = Math.max(...(agentAttendance.weeklyDays || []).map(d => d.totalMs), 1);

              // --- LEAVE CALCULATION LOGIC ---
              const agentDesig = agentAttendance.designation || selectedAgent?.designation || 'Intern';
              let earliestSessionDate = Date.now();
              if (agentAttendance.allSessions && agentAttendance.allSessions.length > 0) {
                earliestSessionDate = new Date(agentAttendance.allSessions[agentAttendance.allSessions.length - 1].startTime).getTime();
              }
              if (agentAttendance.allSessions) {
                agentAttendance.allSessions.forEach(s => {
                  const t = new Date(s.startTime).getTime();
                  if (t < earliestSessionDate) earliestSessionDate = t;
                });
              }
              
              const joinDate = selectedAgent?.createdAt ? new Date(selectedAgent.createdAt).getTime() : earliestSessionDate;
              
              const joinDateObjCalc = new Date(joinDate);
              const todayObjCalc = new Date();
              let monthDiff = (todayObjCalc.getFullYear() - joinDateObjCalc.getFullYear()) * 12 + (todayObjCalc.getMonth() - joinDateObjCalc.getMonth());
              
              let monthsElapsed = 1 + monthDiff;
              if (monthsElapsed < 1) monthsElapsed = 1;

              let earnedRatePerMonth = 0;
              if (agentDesig === 'Intern') earnedRatePerMonth = 1;
              else if (agentDesig === 'Grade-5' || agentDesig === 'Grade-7') earnedRatePerMonth = 22 / 12;
              else if (agentDesig === 'Team Lead') earnedRatePerMonth = 24 / 12;
              else if (agentDesig === 'Manager') earnedRatePerMonth = 26 / 12;
              else earnedRatePerMonth = 1;

              let currentEarnedLeaves = Math.floor(earnedRatePerMonth * monthsElapsed);
              let currentSickLeaves = 1 * monthsElapsed;
              let unpaidLeavesTotal = 0;

              const todayDateObj = new Date();
              todayDateObj.setHours(0, 0, 0, 0);

              const sessionDaysSet = new Set();
              (agentAttendance.allSessions || []).forEach(s => {
                 sessionDaysSet.add(getLocalDateString(s.startTime));
              });

              const historicalAbsences = {};

              // Calculate historical absences day by day
              let iterDate = new Date(joinDate);
              iterDate.setHours(0,0,0,0);
              while (iterDate < todayDateObj) {
                const dayOfWeek = iterDate.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
                  const ds = getLocalDateString(iterDate);
                  if (!sessionDaysSet.has(ds)) {
                    if (currentEarnedLeaves > 0) {
                      currentEarnedLeaves--;
                      historicalAbsences[ds] = 'earned';
                    } else if (currentSickLeaves > 0) {
                      currentSickLeaves--;
                      historicalAbsences[ds] = 'sick';
                    } else {
                      historicalAbsences[ds] = 'unpaid';
                      unpaidLeavesTotal++;
                    }
                  }
                }
                iterDate.setDate(iterDate.getDate() + 1);
              }

              let remainingEarned = currentEarnedLeaves;
              let remainingSick = currentSickLeaves;

              // Calendar Month Stats
              const markedDates = {};
              let monthWorkingDays = 0;
              let monthPresent = 0;
              let monthAbsent = 0;

              const [cYear, cMonth] = calendarMonth.split('-');
              const firstDayOfMonth = new Date(parseInt(cYear), parseInt(cMonth) - 1, 1);
              const lastDayOfMonth = new Date(parseInt(cYear), parseInt(cMonth), 0);
              const joinDateObj = new Date(joinDate);
              joinDateObj.setHours(0, 0, 0, 0);

              for (let d = new Date(firstDayOfMonth); d <= lastDayOfMonth; d.setDate(d.getDate() + 1)) {
                const dateStr = getLocalDateString(d);
                const dayOfWeek = d.getDay();
                const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
                const isBeforeJoinDate = d.getTime() < joinDateObj.getTime();
                
                if (isBeforeJoinDate) {
                  // Prior to onboarding
                  markedDates[dateStr] = { disabled: true, disableTouchEvent: false, selected: true, selectedColor: '#E2E8F0', selectedTextColor: '#94A3B8' };
                } else if (!isWeekday) {
                  // Grey out weekends
                  markedDates[dateStr] = { disabled: true, disableTouchEvent: true, selected: true, selectedColor: '#F1F5F9', selectedTextColor: '#94A3B8' };
                } else {
                  if (d <= todayDateObj) {
                    monthWorkingDays++;
                  }

                  if (sessionDaysSet.has(dateStr)) {
                    markedDates[dateStr] = { selected: true, selectedColor: '#10B981' }; 
                    if (d.getMonth() + 1 === parseInt(cMonth)) monthPresent++;
                  } else if (d < todayDateObj) {
                    // Past absences
                    const leaveType = historicalAbsences[dateStr];
                    if (leaveType === 'earned') {
                      markedDates[dateStr] = { selected: true, selectedColor: '#3B82F6' }; // Blue
                    } else if (leaveType === 'sick') {
                      markedDates[dateStr] = { selected: true, selectedColor: '#8B5CF6' }; // Purple
                    } else {
                      markedDates[dateStr] = { selected: true, selectedColor: '#EF4444' }; // Red (Unpaid)
                    }
                    if (d.getMonth() + 1 === parseInt(cMonth)) monthAbsent++;
                  } else if (d.getTime() === todayDateObj.getTime()) {
                    // Today, not logged in yet
                    markedDates[dateStr] = { selected: true, selectedColor: '#FCA5A5' };
                  }
                }
              }

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                  
                  {/* Current Live Status (Only show if viewing Today) */}
                  {isTodayFilter && !attendanceCalendarMode && (
                    <View style={[styles.attendanceStatusCard, { borderLeftColor: agentAttendance.isCurrentlyOnline ? '#10B981' : '#94A3B8' }]}>
                          <View style={[styles.attendanceLiveDot, { backgroundColor: agentAttendance.isCurrentlyOnline ? '#10B981' : '#CBD5E1' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.attendanceStatusText, { color: agentAttendance.isCurrentlyOnline ? '#059669' : '#64748B' }]}>
                              {agentAttendance.isCurrentlyOnline ? 'Currently Online' : 'Offline'}
                            </Text>
                            {!agentAttendance.isCurrentlyOnline && agentAttendance.lastSeen && agentAttendance.lastSeen !== 'Now' && (
                              <Text style={styles.attendanceLastSeen}>
                                Last seen {new Date(agentAttendance.lastSeen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            )}
                            {agentAttendance.isCurrentlyOnline && agentAttendance.activeSessions?.length > 0 && (
                              <Text style={styles.attendanceLastSeen}>
                                Session started {new Date(agentAttendance.activeSessions[0].startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Mode Toggle & Date Filter Controls */}
                      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                        <TouchableOpacity 
                          onPress={() => { setAttendanceRangeMode(false); setAttendanceCalendarMode(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (!attendanceRangeMode && !attendanceCalendarMode) ? '#E0E7FF' : '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                        >
                          <Ionicons name="today-outline" size={14} color={(!attendanceRangeMode && !attendanceCalendarMode) ? "#4F46E5" : "#64748B"} />
                          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: (!attendanceRangeMode && !attendanceCalendarMode) ? "#4F46E5" : "#64748B" }}>
                            Single Date
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => { setAttendanceRangeMode(true); setAttendanceCalendarMode(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (attendanceRangeMode && !attendanceCalendarMode) ? '#E0E7FF' : '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                        >
                          <Ionicons name="options-outline" size={14} color={(attendanceRangeMode && !attendanceCalendarMode) ? "#4F46E5" : "#64748B"} />
                          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: (attendanceRangeMode && !attendanceCalendarMode) ? "#4F46E5" : "#64748B" }}>
                            Range
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => { setAttendanceCalendarMode(true); setAttendanceRangeMode(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: attendanceCalendarMode ? '#E0E7FF' : '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                        >
                          <Ionicons name="calendar" size={14} color={attendanceCalendarMode ? "#4F46E5" : "#64748B"} />
                          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: attendanceCalendarMode ? "#4F46E5" : "#64748B" }}>
                            Calendar
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {attendanceCalendarMode ? (
                        <>
                          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 16, ...shadows.sm }}>
                            <Calendar
                              current={calendarMonth + '-01'}
                              onMonthChange={(month) => {
                                setCalendarMonth(month.dateString.slice(0, 7));
                                setSelectedLeaveDate(null);
                              }}
                              onDayPress={(day) => {
                                const ds = day.dateString;
                                const dsObj = new Date(parseInt(ds.split('-')[0]), parseInt(ds.split('-')[1]) - 1, parseInt(ds.split('-')[2]));
                                const isBeforeJoinDate = dsObj.getTime() < joinDateObj.getTime();
                                
                                if (isBeforeJoinDate) {
                                  setSelectedLeaveDate({ date: ds, type: 'pre_join' });
                                } else if (historicalAbsences[ds]) {
                                  setSelectedLeaveDate({ date: ds, type: historicalAbsences[ds] });
                                } else if (sessionDaysSet.has(ds)) {
                                  setSelectedLeaveDate({ date: ds, type: 'present' });
                                } else {
                                  setSelectedLeaveDate(null);
                                }
                              }}
                              markedDates={markedDates}
                              theme={{
                                arrowColor: '#4F46E5',
                                todayTextColor: '#4F46E5',
                                selectedDayBackgroundColor: '#4F46E5',
                                textDayFontWeight: '500',
                                textMonthFontWeight: 'bold',
                              }}
                            />
                            
                            {selectedLeaveDate && (
                              <View style={{ backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8, marginTop: 12 }}>
                                <Text style={{ fontWeight: 'bold', color: '#1E3A8A' }}>
                                  Date: {selectedLeaveDate.date}
                                </Text>
                                <Text style={{ color: '#1E3A8A', marginTop: 4 }}>
                                  Status: {
                                    selectedLeaveDate.type === 'pre_join' ? '⚪ Not Employed (Pre-Onboarding)' :
                                    selectedLeaveDate.type === 'present' ? '✅ Present (Session Logged)' :
                                    selectedLeaveDate.type === 'earned' ? '🔵 Earned Leave (Deducted)' :
                                    selectedLeaveDate.type === 'sick' ? '🟣 Sick Leave (Deducted)' :
                                    '🔴 Unpaid Absence'
                                  }
                                </Text>
                              </View>
                            )}
                            
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, justifyContent: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', marginRight: 4 }} /><Text style={{ fontSize: 10, color: '#64748B' }}>Present</Text></View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginRight: 4 }} /><Text style={{ fontSize: 10, color: '#64748B' }}>Earned L.</Text></View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#8B5CF6', marginRight: 4 }} /><Text style={{ fontSize: 10, color: '#64748B' }}>Sick L.</Text></View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginRight: 4 }} /><Text style={{ fontSize: 10, color: '#64748B' }}>Unpaid</Text></View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', marginRight: 4 }} /><Text style={{ fontSize: 10, color: '#64748B' }}>Weekend</Text></View>
                            </View>
                          </View>
                          
                          <View style={{ backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 12 }}>Monthly Stats ({calendarMonth})</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ color: '#64748B' }}>Working Days (till date):</Text>
                              <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>{monthWorkingDays}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ color: '#64748B' }}>Present:</Text>
                              <Text style={{ fontWeight: 'bold', color: '#10B981' }}>{monthPresent}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                              <Text style={{ color: '#64748B' }}>Absent:</Text>
                              <Text style={{ fontWeight: 'bold', color: '#EF4444' }}>{monthAbsent}</Text>
                            </View>

                            <View style={{ height: 1, backgroundColor: '#E2E8F0', marginBottom: 12 }} />

                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 12 }}>Overall Leave Balances</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ color: '#64748B' }}>Earned Leaves Remaining:</Text>
                              <Text style={{ fontWeight: 'bold', color: '#3B82F6' }}>{remainingEarned}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: '#64748B' }}>Sick Leaves Remaining:</Text>
                              <Text style={{ fontWeight: 'bold', color: '#8B5CF6' }}>{remainingSick}</Text>
                            </View>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.dateFilterContainer}>
                            {!attendanceRangeMode && (
                              <TouchableOpacity 
                                onPress={() => {
                                  const d = new Date(attendanceDateFilter);
                                  d.setDate(d.getDate() - 1);
                                  setAttendanceDateFilter(getLocalDateString(d));
                                }}
                                style={styles.dateNavBtn}
                              >
                                <Ionicons name="chevron-back" size={20} color="#6366F1" />
                              </TouchableOpacity>
                            )}
                            
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                              <TouchableOpacity 
                                style={[styles.dateDisplayBox, attendanceRangeMode && { flex: 1 }]}
                                onPress={() => setShowDatePicker(true)}
                              >
                                <Ionicons name="calendar-outline" size={16} color="#64748B" />
                                <Text style={styles.dateDisplayText}>
                                  {new Date(attendanceDateFilter).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                </Text>
                              </TouchableOpacity>

                              {attendanceRangeMode && (
                                <>
                                  <Text style={{ alignSelf: 'center', color: '#94A3B8', fontWeight: 'bold' }}>→</Text>
                                  <TouchableOpacity 
                                    style={[styles.dateDisplayBox, { flex: 1 }]}
                                    onPress={() => setShowEndDatePicker(true)}
                                  >
                                    <Ionicons name="calendar-outline" size={16} color="#64748B" />
                                    <Text style={styles.dateDisplayText}>
                                      {new Date(attendanceEndDateFilter).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                    </Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>

                            {!attendanceRangeMode && (
                              <TouchableOpacity 
                                disabled={isTodayFilter}
                                onPress={() => {
                                  const d = new Date(attendanceDateFilter);
                                  d.setDate(d.getDate() + 1);
                                  setAttendanceDateFilter(getLocalDateString(d));
                                }}
                                style={[styles.dateNavBtn, isTodayFilter && { opacity: 0.3 }]}
                              >
                                <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* Early Checkout Justification Card */}
                          {(() => {
                            let justificationLog = null;
                            if (auditLogs) {
                              justificationLog = auditLogs.find(log => {
                                if (log.action !== 'SUPPORT_SHIFT_CHECKOUT' || log.userId !== selectedAgentId) return false;
                                if (!log.details || !log.details.justification) return false;
                                const dStr = getLocalDateString(new Date(log.timestamp));
                                if (attendanceRangeMode) {
                                  return dStr >= attendanceDateFilter && dStr <= attendanceEndDateFilter;
                                }
                                return dStr === attendanceDateFilter;
                              });
                            }
                            return justificationLog ? (
                              <View style={{ backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  <Ionicons name="warning" size={16} color="#D97706" style={{ marginRight: 6 }} />
                                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#B45309' }}>Early Checkout Justification</Text>
                                </View>
                                <Text style={{ fontSize: 13, color: '#92400E', fontStyle: 'italic', marginBottom: 8 }}>"{justificationLog.details.justification}"</Text>
                                <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>Logged at {new Date(justificationLog.timestamp).toLocaleTimeString()}</Text>
                              </View>
                            ) : null;
                          })()}

                          {/* Hours Chart for Selected Date */}
                          <View style={styles.todayHoursCard}>
                            <View style={styles.todayHoursTop}>
                              <Text style={styles.todayHoursLabel}>
                                {attendanceRangeMode ? 'Total Active Time (Range)' : `Active Time (${isTodayFilter ? 'Today' : 'Selected Date'})`}
                              </Text>
                              <Text style={styles.todayHoursValue}>
                                {dateHours > 0 ? `${dateHours}h ` : ''}{dateMins}m
                              </Text>
                            </View>
                            <View style={styles.todayProgressBg}>
                              <View style={[
                                styles.todayProgressBar, 
                                { width: `${dateProgress}%`, backgroundColor: dateProgress >= 80 ? '#10B981' : dateProgress >= 50 ? '#F59E0B' : '#3B82F6' }
                              ]} />
                            </View>
                            <Text style={styles.todayProgressLabel}>
                              {attendanceRangeMode 
                                ? `${(totalMsForDate / 3600000).toFixed(1)}h over selected period` 
                                : `${Math.round(dateProgress)}% of 8h target`}
                            </Text>
                          </View>

                          {/* Sessions for Selected Date */}
                          <View style={styles.sessionLogCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <Text style={[styles.sessionLogTitle, { marginBottom: 0 }]}>Session Log ({displaySessions.length} total)</Text>
                              <TouchableOpacity onPress={() => setShowActiveSessionsOnly(!showActiveSessionsOnly)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 32, height: 18, borderRadius: 9, backgroundColor: showActiveSessionsOnly ? '#10B981' : '#E2E8F0', padding: 2 }}>
                                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF', transform: [{ translateX: showActiveSessionsOnly ? 14 : 0 }] }} />
                                </View>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: showActiveSessionsOnly ? '#10B981' : '#94A3B8' }}>Active Only</Text>
                              </TouchableOpacity>
                            </View>
                            {(() => {
                              const processedSessions = displaySessions.map(sess => {
                                const count = auditLogs.filter(log => {
                                  if (log.userId !== selectedAgentId) return false;
                                  if (log.category !== 'support_activity') return false;
                                  const logTime = new Date(log.timestamp).getTime();
                                  const sessStart = new Date(sess.startTime).getTime();
                                  const sessEnd = sess.isLive ? Date.now() : new Date(sess.endTime).getTime();
                                  return logTime >= sessStart && logTime <= sessEnd;
                                }).length;
                                return { ...sess, activityCount: count };
                              });
                              
                              const filteredSessions = showActiveSessionsOnly 
                                ? processedSessions.filter(s => s.activityCount > 0) 
                                : processedSessions;
                              
                              if (filteredSessions.length === 0) {
                                return (
                                  <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: '#94A3B8', fontWeight: '600' }}>
                                      {showActiveSessionsOnly ? 'No active sessions found.' : 'No sessions on this date.'}
                                    </Text>
                                  </View>
                                );
                              }

                              return filteredSessions.map((sess, i) => {
                                const startDate = new Date(sess.startTime);
                                const endDate = sess.isLive ? new Date() : new Date(sess.endTime);
                                const durHrs = Math.floor(sess.durationMs / 3600000);
                                const durMins = Math.floor((sess.durationMs % 3600000) / 60000);
                                return (
                                  <TouchableOpacity 
                                    key={i} 
                                    style={[styles.sessionLogRow, { borderLeftWidth: 3, borderLeftColor: sess.isLive ? '#10B981' : '#6366F1' }]}
                                    onPress={() => setSelectedSessionForActivity({ ...sess, agentId: selectedAgentId })}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.sessionLogTime}>
                                        {startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} → {sess.isLive ? 'ACTIVE NOW' : endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                      </Text>
                                      <Text style={{ fontSize: 11, color: sess.activityCount > 0 ? '#6366F1' : '#94A3B8', marginTop: 2, fontWeight: sess.activityCount > 0 ? '700' : '400' }}>
                                        Tap to view activities {sess.activityCount > 0 ? `(${sess.activityCount} activities)` : '(Idle)'}
                                      </Text>
                                    </View>
                                    <Text style={[styles.sessionLogDuration, sess.isLive && { color: '#10B981' }]}>
                                      {durHrs > 0 ? `${durHrs}h ` : ''}{durMins}m
                                    </Text>
                                    <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 8 }} />
                                  </TouchableOpacity>
                                );
                              });
                            })()}
                          </View>

                          {/* Weekly Summary */}
                          <View style={[styles.weeklyCard, { marginTop: 20 }]}>
                            <Text style={styles.weeklyTitle}>Current Week Summary</Text>
                            <View style={styles.weeklyBarsRow}>
                              {(agentAttendance.weeklyDays || []).map((day, i) => {
                                const barHeight = Math.max((day.totalMs / maxWeeklyMs) * 60, 3);
                                const hrs = Math.floor(day.totalMs / 3600000);
                                const mins = Math.floor((day.totalMs % 3600000) / 60000);
                                const isToday = day.date === getLocalDateString();
                                return (
                                  <View key={i} style={styles.weeklyBarCol}>
                                    <Text style={styles.weeklyBarValue}>
                                      {day.totalMs > 0 ? (hrs > 0 ? `${hrs}h` : `${mins}m`) : ''}
                                    </Text>
                                    <View style={[
                                      styles.weeklyBar, 
                                      { height: barHeight, backgroundColor: isToday ? '#6366F1' : (day.totalMs > 0 ? '#A5B4FC' : '#E2E8F0') }
                                    ]} />
                                    <Text style={[styles.weeklyBarLabel, isToday && { color: '#6366F1', fontWeight: '900' }]}>
                                      {day.dayName}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        </>
                      )}
                    </ScrollView>
              );
            })()}
          </View>
        </View>
        {showDatePicker && (
          <Modal transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.8)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#FFF', borderRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0F172A' }}>{attendanceRangeMode ? "Select Start Date" : "Select Date"}</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>
                <PureJSDateTimePicker 
                    mode="date"
                    value={attendanceDateFilter}
                    maxDate={attendanceRangeMode ? attendanceEndDateFilter : getLocalDateString()}
                    onChange={(val) => { setAttendanceDateFilter(val); setShowDatePicker(false); }}
                />
              </View>
            </View>
          </Modal>
        )}

        {showEndDatePicker && (
          <Modal transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.8)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#FFF', borderRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0F172A' }}>Select End Date</Text>
                    <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                        <Ionicons name="close" size={24} color="#0F172A" />
                    </TouchableOpacity>
                </View>
                <PureJSDateTimePicker 
                    mode="date"
                    value={attendanceEndDateFilter}
                    minDate={attendanceDateFilter}
                    maxDate={getLocalDateString()}
                    onChange={(val) => { setAttendanceEndDateFilter(val); setShowEndDatePicker(false); }}
                />
              </View>
            </View>
          </Modal>
        )}
      </Modal>

  );
};
