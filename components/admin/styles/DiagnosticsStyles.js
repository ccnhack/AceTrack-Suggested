import { StyleSheet, Dimensions, Platform } from 'react-native';
import { colors, shadows } from '../../../theme/designSystem';

const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  diagHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  healthDashboard: { marginBottom: 24, gap: 10 },
  healthRow: { flexDirection: 'row', gap: 10 },
  healthCard: { 
    flex: 1, 
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16, 
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 }
    }),
    position: 'relative',
    overflow: 'hidden'
  },
  healthLabel: { fontSize: 8, fontWeight: '900', color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  healthValue: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  healthSubValue: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  cardIcon: { position: 'absolute', right: -6, bottom: -6, opacity: 0.15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  diagSyncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  diagSyncBtnText: { fontSize: 10, fontWeight: 'bold', color: '#FFF', marginLeft: 4 },
  modeCloud: { backgroundColor: '#10B981' },
  modeLocal: { backgroundColor: '#F59E0B' },
  diagSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  diagSearchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B' },
  userListScroll: { marginBottom: 20 },
  miniUserCard: { width: 80, alignItems: 'center', marginRight: 12, padding: 8, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F1F5F9' },
  miniUserCardActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  miniAvatar: {},
  miniUserName: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  miniUserNameActive: { color: '#FFF' },
  miniUserId: { fontSize: 8, color: '#94A3B8' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cloudSearchHint: { width: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE', padding: 10 },
  cloudSearchText: { fontSize: 10, fontWeight: 'bold', color: '#6366F1', textAlign: 'center', marginTop: 4 },
  cloudResults: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 20 },
  cloudResultsTitle: { fontSize: 12, fontWeight: 'bold', color: '#1E293B', marginBottom: 8 },
  cloudFileItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  cloudFileName: { fontSize: 11, color: '#6366F1', marginLeft: 8 },
  liveSessionsContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  liveDeviceItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#6366F1',
    elevation: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  diagFileSection: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  diagSectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: 12 },
  deviceItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  deviceName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  deviceMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  statusText: { fontSize: 9, fontWeight: 'bold' },
  deviceAppVersion: { fontSize: 9, color: '#94A3B8' },
  pullBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
  pullBtnDisabled: { backgroundColor: '#CBD5E1' },
  pullBtnText: { fontSize: 10, fontWeight: 'bold', color: '#FFF' },
  noDevicesBox: { alignItems: 'center', padding: 20, backgroundColor: '#F8FAFC', borderRadius: 16 },
  noDevicesText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 12 },
  livePullBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  livePullBtnText: { fontSize: 12, fontWeight: 'bold', color: '#6366F1' },
  fileList: { gap: 4 },
  fileItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F8FAFC' },
  fileItemActive: { backgroundColor: '#64748B' },
  fileName: { flex: 1, fontSize: 11, color: '#475569', marginLeft: 8 },
  fileNameActive: { color: '#FFF' },
  emptyFilesText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 20 },
  viewerContainer: { marginTop: 20, backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  viewerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  viewerTitle: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  downloadBtnText: { fontSize: 12, fontWeight: 'bold', color: '#6366F1' },
  viewerContent: { maxHeight: 400, backgroundColor: '#1E293B', borderRadius: 12, padding: 12 },
  viewerText: { 
    color: '#ADB5BD', 
    fontSize: 10, 
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' 
  },
  
  // 💎 Glassmorphism Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 24
  },
  glassModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 32,
    padding: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 10 }
    }),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  modalContent: {
    gap: 16,
    maxHeight: '90%'
  },
  scoreRow: {
    alignItems: 'center',
    marginBottom: 20
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase'
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '900'
  },
  detailCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#CBD5E1',
    marginBottom: 8
  },
  detailCardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 12,
    textTransform: 'uppercase'
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#64748B'
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  modalHelperText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16
  },
  modalFooterBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24
  },
  modalFooterBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1
  },
  backpressureVisual: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4
  },
  backpressureBar: {
    height: '100%',
    backgroundColor: '#EF4444'
  },
  incidentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  incidentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6366F1',
    marginTop: 6,
  },
  incidentTime: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginBottom: 2,
  },
  incidentMsg: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyIncidentsText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  }
});

export default AdminDiagnosticsPanel;
