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

const GroupedShiftCard = ({ shifts }) => {
  const baseUser = shifts[0]; // All segments share the same employee profile details
  
  const [selectedIntervals, setSelectedIntervals] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
      const timer = setInterval(() => {
          setTick(t => t + 1);
      }, 30000); // Re-render every 30 seconds to update 'In Progress' text
      return () => clearInterval(timer);
  }, []);
  
  let totalDurationMs = 0;
  let totalActiveDurationMs = 0;
  let totalBreakMs = 0;
  let hasInProgress = false;
  let hasOnBreak = false;
  let hasAutoCheckout = false;
  let hasEarlyCheckout = false;
  let hasBreakExceeded = false;
  let totalOvertimeMs = 0;

  shifts.forEach(s => {
    if (s.totalShiftMs != null) totalDurationMs += s.totalShiftMs;
    else hasInProgress = true;
    
    if (s.isOnBreak) hasOnBreak = true;
    if (s.totalBreakMs) totalBreakMs += s.totalBreakMs;
    if (s.breakExceeded) hasBreakExceeded = true;
    
    if (s.activeDurationMs != null) totalActiveDurationMs += s.activeDurationMs;
    if (s.isAutoCheckout) hasAutoCheckout = true;
    if (s.isEarlyCheckout) hasEarlyCheckout = true;
    if (s.overtimeMs > 0) totalOvertimeMs += s.overtimeMs;
  });

  const durationStr = totalDurationMs > 0 ? formatDuration(totalDurationMs) : '0m';
  const finalDurationStr = hasInProgress ? (totalDurationMs > 0 ? `${durationStr} + In Progress` : 'In Progress') : durationStr;
  
  const activeDurationStr = totalActiveDurationMs > 0 ? formatDuration(totalActiveDurationMs) : '0m';
  const finalActiveDurationStr = hasInProgress ? (totalActiveDurationMs > 0 ? `${activeDurationStr} + In Progress` : 'In Progress') : activeDurationStr;
  const overtimeStr = totalOvertimeMs > 0 ? `+${Math.floor(totalOvertimeMs / 60000)}m` : null;

  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: hasEarlyCheckout ? 'rgba(245,158,11,0.3)' : totalOvertimeMs > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)' }}>
      {/* Name Row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <SafeAvatar uri={baseUser.avatar} name={baseUser.name} size={28} borderRadius={8} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700' }}>{baseUser.name}</Text>
          <Text style={{ color: '#64748B', fontSize: 10 }}>{baseUser.email || baseUser.supportLevel}</Text>
          <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '500', marginTop: 2 }}>Expected Shift: {baseUser.scheduledStart} - {baseUser.scheduledEnd}</Text>
          {baseUser.managerName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="person-circle-outline" size={10} color="#6366F1" style={{ marginRight: 3 }} />
              <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '600' }}>Reports to: {baseUser.managerName}</Text>
            </View>
          ) : null}
        </View>
        
        {/* Aggregated Badges */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {hasOnBreak ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#FBBF24', fontSize: 9, fontWeight: '800' }}>ON BREAK</Text>
            </View>
          ) : hasInProgress ? (
            <View style={{ backgroundColor: 'rgba(99,102,241,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#818CF8', fontSize: 9, fontWeight: '800' }}>IN PROGRESS</Text>
            </View>
          ) : null}
          {hasAutoCheckout && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#FBBF24', fontSize: 9, fontWeight: '800' }}>AUTO</Text>
            </View>
          )}
          {hasEarlyCheckout && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '800' }}>EARLY</Text>
            </View>
          )}
          {overtimeStr && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#F87171', fontSize: 9, fontWeight: '800' }}>{overtimeStr} OT</Text>
            </View>
          )}
          {hasBreakExceeded && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: '#EF4444', fontSize: 9, fontWeight: '800' }}>BREAK EXCEEDED</Text>
            </View>
          )}
        </View>
      </View>

      {/* Segments Header */}
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>SHIFT SEGMENTS</Text>
      </View>

      {/* Shift Segments List */}
      <View style={{ gap: 6 }}>
        {shifts.map((shift, shiftIdx) => {
            // Render explicit segments if available
            if (shift.segments && shift.segments.length > 0) {
                return shift.segments.map((seg, segIdx) => {
                    const startStr = seg.start ? new Date(seg.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                    const endStr = seg.end ? new Date(seg.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                    let durStr = 'In Progress';
                    if (seg.durationMs != null) {
                        durStr = formatDuration(seg.durationMs);
                    } else if (seg.start) {
                        const msDiff = Math.max(0, new Date().getTime() - new Date(seg.start).getTime());
                        durStr = `In Progress (${formatDuration(msDiff)})`;
                    }
                    
                    let activeDurStr = '0m';
                    if (seg.activeDurationMs != null) {
                        activeDurStr = formatDuration(seg.activeDurationMs);
                    }
                    
                    if (seg.type === 'break') {
                        return (
                            <View key={`${shiftIdx}-${segIdx}`} style={{ backgroundColor: 'rgba(245,158,11,0.05)', padding: 10, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#F59E0B' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Ionicons name="cafe-outline" size={12} color="#F59E0B" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '600' }}>{startStr} <Text style={{ color: '#D97706' }}>to</Text> {endStr}</Text>
                                        {segIdx === 0 && shift.isAutoCheckout && (
                                            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                                <Text style={{ color: '#FBBF24', fontSize: 8, fontWeight: '800' }}>AUTO</Text>
                                            </View>
                                        )}
                                        {segIdx === 0 && shift.isEarlyCheckout && (
                                            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                                <Text style={{ color: '#F59E0B', fontSize: 8, fontWeight: '800' }}>EARLY</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '700' }}>{durStr} {seg.lateDurationMinutes ? `(Late ${seg.lateDurationMinutes}m)` : ''}</Text>
                                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Break</Text>
                                    </View>
                                </View>
                                {(seg.justification || seg.resolvedByName) && (
                                    <View style={{ marginTop: 6 }}>
                                        {seg.justification ? <Text style={{ color: '#FBBF24', fontSize: 10, fontStyle: 'italic' }}>"{seg.justification}"</Text> : null}
                                        {seg.resolvedByName && (
                                            <Text style={{ color: '#FCD34D', fontSize: 9, marginTop: 2, fontWeight: '600' }}>
                                                Approved by {seg.resolvedByRole} ({seg.resolvedByName})
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    }
                    
                    // Active shift segment
                    return (
                        <View key={`${shiftIdx}-${segIdx}`} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Ionicons name="time-outline" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600' }}>{startStr} <Text style={{ color: '#64748B' }}>to</Text> {endStr}</Text>
                                    {segIdx === 0 && shift.isAutoCheckout && (
                                        <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                            <Text style={{ color: '#FBBF24', fontSize: 8, fontWeight: '800' }}>AUTO</Text>
                                        </View>
                                    )}
                                    {segIdx === 0 && shift.isEarlyCheckout && (
                                        <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                            <Text style={{ color: '#F59E0B', fontSize: 8, fontWeight: '800' }}>EARLY</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#A5B4FC', fontSize: 11, fontWeight: '700' }}>{durStr}</Text>
                                    {seg.activeIntervals && seg.activeIntervals.length > 0 ? (
                                        <TouchableOpacity onPress={() => setSelectedIntervals({ intervals: seg.activeIntervals, start: seg.start, end: seg.end || Date.now() })} style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600' }}>Actual Active: {activeDurStr}</Text>
                                            <Ionicons name="information-circle-outline" size={12} color="#10B981" style={{ marginLeft: 4 }} />
                                        </TouchableOpacity>
                                    ) : (
                                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Actual Active: {activeDurStr}</Text>
                                    )}
                                </View>
                            </View>
                            {segIdx === shift.segments.length - 1 && shift.overtimeStatus && shift.shiftLogId && (
                                <OvertimeJustificationInput 
                                    shiftLogId={shift.shiftLogId} 
                                    initialValue={shift.overtimeJustification} 
                                    initialStatus={shift.overtimeStatus} 
                                />
                            )}
                        </View>
                    );
                });
            }
            
            // Fallback for older data without explicit segments
            const checkinStr = shift.checkinTime ? new Date(shift.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
            const checkoutStr = shift.checkoutTime ? new Date(shift.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
            let durStr = 'In Progress';
            if (shift.totalShiftMs != null) {
                durStr = formatDuration(shift.totalShiftMs);
            } else if (shift.checkinTime) {
                const msDiff = Math.max(0, new Date().getTime() - new Date(shift.checkinTime).getTime());
                durStr = `In Progress (${formatDuration(msDiff)})`;
            }
            
            const activeDurStr = shift.activeDurationMs != null ? formatDuration(shift.activeDurationMs) : '0m';
            return (
                <View key={shiftIdx} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={12} color="#6366F1" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600' }}>{checkinStr} <Text style={{ color: '#64748B' }}>to</Text> {checkoutStr}</Text>
                            {shift.isAutoCheckout && (
                                <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                    <Text style={{ color: '#FBBF24', fontSize: 8, fontWeight: '800' }}>AUTO</Text>
                                </View>
                            )}
                            {shift.isEarlyCheckout && (
                                <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                    <Text style={{ color: '#F59E0B', fontSize: 8, fontWeight: '800' }}>EARLY</Text>
                                </View>
                            )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: '#A5B4FC', fontSize: 11, fontWeight: '700' }}>{durStr}</Text>
                            {shift.activeIntervals && shift.activeIntervals.length > 0 ? (
                                <TouchableOpacity onPress={() => setSelectedIntervals({ intervals: shift.activeIntervals, start: new Date(shift.checkinTime).getTime(), end: shift.checkoutTime ? new Date(shift.checkoutTime).getTime() : Date.now() })} style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600' }}>Actual Active: {activeDurStr}</Text>
                                    <Ionicons name="information-circle-outline" size={12} color="#10B981" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            ) : (
                                <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Actual Active: {activeDurStr}</Text>
                            )}
                        </View>
                    </View>
                    {shift.justification && (
                        <View style={{ marginTop: 6, backgroundColor: 'rgba(245,158,11,0.05)', padding: 6, borderRadius: 6, borderLeftWidth: 2, borderLeftColor: '#F59E0B' }}>
                            <Text style={{ color: '#FDE68A', fontSize: 10, fontStyle: 'italic' }}>"{shift.justification}"</Text>
                        </View>
                    )}
                    {shift.overtimeStatus && shift.shiftLogId && (
                        <OvertimeJustificationInput 
                            shiftLogId={shift.shiftLogId} 
                            initialValue={shift.overtimeJustification} 
                            initialStatus={shift.overtimeStatus} 
                        />
                    )}
                </View>
            );
        })}
      </View>

      {/* Total Duration Footer */}
      {shifts.length > 1 && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL SHIFT DURATION</Text>
                <Text style={{ color: '#A5B4FC', fontSize: 12, fontWeight: '800' }}>{finalDurationStr}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL ACTIVE DURATION</Text>
                <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '800' }}>{finalActiveDurationStr}</Text>
            </View>
            {totalBreakMs > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL BREAK TIME</Text>
                    <Text style={{ color: hasBreakExceeded ? '#EF4444' : '#F59E0B', fontSize: 12, fontWeight: '800' }}>
                        {formatDuration(totalBreakMs)}{hasBreakExceeded ? ' ⚠️' : ''}
                    </Text>
                </View>
            )}
        </View>
      )}

      {/* 🎯 [ACTIVITY HEARTBEAT] Breakdown Modal */}
      {selectedIntervals && (
          <Modal transparent visible animationType="fade" onRequestClose={() => setSelectedIntervals(null)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#1E293B', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' }}>
                      <View style={{ padding: 16, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="stats-chart" size={16} color="#10B981" style={{ marginRight: 8 }} />
                              <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '700' }}>Activity Timeline</Text>
                          </View>
                          <TouchableOpacity onPress={() => setSelectedIntervals(null)}>
                              <Ionicons name="close" size={24} color="#94A3B8" />
                          </TouchableOpacity>
                      </View>
                      
                      <ScrollView style={{ maxHeight: 300, padding: 16 }}>
                          {(() => {
                              const blocks = [];
                              const startCursor = selectedIntervals.start;
                              const endCursor = selectedIntervals.end;
                              const intervals = selectedIntervals.intervals;
                              
                              if (intervals.length === 0) {
                                  return <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', marginVertical: 20 }}>No activity data available for this segment.</Text>;
                              }

                              // Initial AFK block if first interval doesn't start exactly at segment start
                              if (intervals[0][0] > startCursor + 60000) {
                                  blocks.push({ type: 'afk', start: startCursor, end: intervals[0][0] });
                              }

                              for (let i = 0; i < intervals.length; i++) {
                                  blocks.push({ type: 'active', start: intervals[i][0], end: intervals[i][1] });
                                  
                                  // Inter-interval AFK block
                                  if (i < intervals.length - 1) {
                                      const gapStart = intervals[i][1];
                                      const gapEnd = intervals[i+1][0];
                                      if (gapEnd - gapStart > 60000) {
                                          blocks.push({ type: 'afk', start: gapStart, end: gapEnd });
                                      }
                                  }
                              }

                              // Trailing AFK block
                              const lastEnd = intervals[intervals.length - 1][1];
                              if (endCursor - lastEnd > 60000) {
                                  blocks.push({ type: 'afk', start: lastEnd, end: endCursor });
                              }

                              return blocks.map((block, idx) => {
                                  const sTime = new Date(block.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                  const eTime = new Date(block.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                  const dur = formatDuration(block.end - block.start);
                                  
                                  if (block.type === 'active') {
                                      return (
                                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', marginTop: 4, marginRight: 12 }} />
                                              <View style={{ flex: 1 }}>
                                                  <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '600' }}>{sTime} <Text style={{ color: '#64748B' }}>→</Text> {eTime}</Text>
                                                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700', marginTop: 2 }}>{dur} (Active)</Text>
                                              </View>
                                          </View>
                                      );
                                  } else {
                                      return (
                                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, opacity: 0.7 }}>
                                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginTop: 4, marginRight: 12 }} />
                                              <View style={{ flex: 1 }}>
                                                  <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>{sTime} <Text style={{ color: '#64748B' }}>→</Text> {eTime}</Text>
                                                  <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700', marginTop: 2 }}>{dur} (Unavailable/AFK)</Text>
                                              </View>
                                          </View>
                                      );
                                  }
                              });
                          })()}
                      </ScrollView>
                  </View>
              </View>
          </Modal>
      )}
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════ */
/* 🛠️ HELPER FUNCTIONS                                       */
/* ═══════════════════════════════════════════════════════════ */
export function formatDateISO(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateDDMMYYYY(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function parseDDMMYYYYToISO(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (isNaN(d.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}


export default GroupedShiftCard;
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }
});

