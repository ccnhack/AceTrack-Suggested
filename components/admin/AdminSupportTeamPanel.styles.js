import { colors, shadows, typography, borderRadius, spacing } from '../../theme/designSystem';
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },

  // 🕐 Time Filter
  timeFilterContainer: { marginBottom: 12 },
  timeFilterRow: { gap: 6, paddingVertical: 4 },
  timeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  timeChipActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  timeChipText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  timeChipTextActive: { color: '#FFFFFF' },
  filterNote: { fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },

  // 📅 Custom Range
  customRangeCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E7FF', ...shadows.sm },
  customRangeTitle: { fontSize: 13, fontWeight: '800', color: '#4F46E5', marginBottom: 12 },
  customRangeRow: { flexDirection: 'row', gap: 10 },
  customRangeField: { flex: 1 },
  customRangeLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  customRangeInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0F172A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  customRangeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  customRangeCancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9' },
  customRangeCancelText: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  customRangeApplyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#6366F1' },
  customRangeApplyText: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  // 📊 Team Summary
  teamSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', padding: 10, borderRadius: 12, borderLeftWidth: 3, alignItems: 'center', ...shadows.sm },
  summaryValue: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  summaryLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginTop: 2 },

  // Sub-Tabs
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  subTab: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 16, paddingVertical: 10, 
    borderRadius: 12, backgroundColor: '#F1F5F9', 
    borderWidth: 1, borderColor: '#E2E8F0' 
  },
  subTabActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  subTabTerminated: { backgroundColor: '#EF4444', borderColor: '#DC2626' },
  subTabText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  subTabTextActive: { color: '#FFFFFF' },

  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', fontWeight: '600' },

  // Agent Row
  userRowContainer: { marginBottom: 16 },
  miniCard: { width: 70, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniCardActive: { backgroundColor: '#6366F1', borderColor: '#4F46E5' },
  miniCardTerminated: { opacity: 0.7, borderColor: '#FCA5A5' },
  miniName: { fontSize: 9, fontWeight: '800', color: '#64748B', marginTop: 4, textAlign: 'center' },
  miniNameActive: { color: '#FFF' },
  miniNameTerminated: { color: '#94A3B8' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#FFF' },
  avatarTerminated: { opacity: 0.5 },
  emptyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8 },
  emptyAgents: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  // Detail Card
  mainContent: { flex: 1 },
  detailCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...shadows.md, borderWidth: 1, borderColor: '#F1F5F9' },
  detailCardTerminated: { borderColor: '#FCA5A5', backgroundColor: '#FFFBFB' },
  detailHeader: { flexDirection: 'row', alignItems: 'center' },
  detailAvatarBox: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 40 },
  detailNameBox: { flex: 1 },
  detailName: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  detailEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  textTerminated: { color: '#94A3B8' },
  textMuted: { color: '#94A3B8' },

  // Level & Status
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  levelTag: { fontSize: 10, fontWeight: '800', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'uppercase' },
  levelTagTerminated: { color: '#94A3B8', backgroundColor: '#F1F5F9' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  // Terminated Banner
  terminatedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EF4444', paddingVertical: 8, borderRadius: 12, marginBottom: 16 },
  terminatedBannerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Action Buttons
  settingsBtn: { position: 'absolute', top: 20, right: 20, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', zIndex: 10 },
  reOnboardBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, marginTop: 4,
    ...shadows.sm
  },
  reOnboardText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // Stats Grid — Top Cards
  statsGrid: { flexDirection: 'row', gap: 10, marginTop: 24 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statBoxTerminated: { backgroundColor: '#FAFAFA', borderColor: '#F1F5F9' },
  statLabel: { fontSize: 7, fontWeight: '900', color: '#94A3B8', marginBottom: 4, textAlign: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  // Detailed Metrics List
  metricsList: { marginTop: 20, gap: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  mValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // Select Hint
  selectHint: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 },
  selectHintText: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 12, textAlign: 'center' },

  // Leaderboard
  leaderboardSection: { marginTop: 32, marginBottom: 20 },
  leaderboardTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  leaderboardItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  leaderboardItemActive: { borderColor: '#6366F1', backgroundColor: '#F5F3FF' },
  rankText: { fontSize: 12, fontWeight: '900', color: '#94A3B8', width: 30 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1E293B' },
  rankMeta: { marginRight: 12 },
  rankMetaText: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  rankScoreBox: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  rankScore: { fontSize: 16, fontWeight: '900', color: '#6366F1' },
  rankScoreUnits: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },

  // 📊 Caseload Distribution Chart
  caseloadSection: { marginTop: 24, marginBottom: 8, backgroundColor: '#FFF', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', ...shadows.sm },
  caseloadTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  caseloadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  caseloadName: { width: 65, fontSize: 11, fontWeight: '700', color: '#64748B' },
  caseloadBarBg: { flex: 1, height: 14, backgroundColor: '#F8FAFC', borderRadius: 7, marginHorizontal: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  caseloadBar: { height: '100%', borderRadius: 7, minWidth: 4 },
  caseloadCount: { width: 24, fontSize: 12, fontWeight: '900', textAlign: 'right' },

  // Timeline
  timelineSection: { marginTop: 20, paddingHorizontal: 4 },
  timelineTitle: { fontSize: 12, fontWeight: '900', color: '#64748B', textTransform: 'uppercase', marginBottom: 16 },
  timelineRow: { flexDirection: 'row', minHeight: 40 },
  timelineLine: { position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, backgroundColor: '#F1F5F9' },
  timelineIconNode: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, zIndex: 1 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineText: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  timelineTime: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },

  // Phase 4 - Export, Alerts, Breakdown
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4, marginRight: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  exportBtnText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  alertsContainer: { marginBottom: 20 },
  alertRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, gap: 8 },
  alertDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  alertWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  alertText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },
  breakdownContainer: { marginBottom: 20 },
  pillsScroll: { marginTop: 4 },
  pillsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  typePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: 20, gap: 8 },
  typePillLabel: { fontSize: 11, fontWeight: '700', color: '#475569' },
  typePillCountBadge: { backgroundColor: '#3B82F6', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typePillCount: { fontSize: 10, fontWeight: '900', color: '#FFF' },

  // Phase 5 - Drill Down Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  modalBody: { flexGrow: 1, paddingBottom: 20 },
  drillTicketCard: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9', ...shadows.sm },
  drillTicketHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  drillTicketId: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  drillTicketStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  drillTicketTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  drillTicketMeta: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 },
  drillTicketAgent: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  drillTicketRating: { fontSize: 12, color: '#F59E0B', fontWeight: '800' },

  attendanceTriggerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4, marginRight: 8 },
  attendanceTriggerText: { fontSize: 11, fontWeight: '800', color: '#6366F1' },

  // 🕐 Attendance Modal Styles
  attendanceModalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  attendanceModalContent: { backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingTop: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '90%' },
  dateFilterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  dateNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 12 },
  dateDisplayBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateDisplayText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  
  // Existing Attendance Styles (moved to Modal)
  attendanceStatusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 4, gap: 12, marginBottom: 14 },
  attendanceLiveDot: { width: 10, height: 10, borderRadius: 5 },
  attendanceStatusText: { fontSize: 14, fontWeight: '800' },
  attendanceLastSeen: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },

  todayHoursCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 14 },
  todayHoursTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  todayHoursLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  todayHoursValue: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  todayProgressBg: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  todayProgressBar: { height: '100%', borderRadius: 5 },
  todayProgressLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textAlign: 'right' },

  weeklyCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 14 },
  weeklyTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 12 },
  weeklyBarsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 },
  weeklyBarCol: { alignItems: 'center', flex: 1 },
  weeklyBarValue: { fontSize: 9, fontWeight: '800', color: '#6366F1', marginBottom: 4, minHeight: 12 },
  weeklyBar: { width: 20, borderRadius: 4, minHeight: 3 },
  weeklyBarLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 6 },

  sessionLogCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  sessionLogTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 12 },
  sessionLogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  sessionLogDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A5B4FC' },
  sessionLogDate: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  sessionLogTime: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
  sessionLogDuration: { fontSize: 13, fontWeight: '900', color: '#6366F1' },

  // Actions Modal
  actionsModalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  actionsModalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, width: '100%', maxWidth: 450, maxHeight: '90%', padding: 24, ...shadows.lg },
  actionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  actionsTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  actionUserCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 24 },
  actionUserName: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  actionUserMeta: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  actionSectionTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 12, marginTop: 8 },
  hierarchyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  hierarchyBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF' },
  hierarchyBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  hierarchyBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  hierarchyBtnTextActive: { color: '#6366F1' },

  managerListContainer: { marginBottom: 20 },
  managerBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingRight: 14, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF', marginRight: 10 },
  managerBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1', borderWidth: 1.5 },
  managerBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B', marginLeft: 8 },
  managerBtnTextActive: { color: '#6366F1' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', gap: 10 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' }
});

export default styles;
