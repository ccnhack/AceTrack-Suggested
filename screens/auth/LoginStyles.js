import { StyleSheet, Dimensions, Platform } from 'react-native';
import { colors, shadows } from '../../theme/designSystem';

const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  headerImageContainer: { height: height < 700 ? height * 0.22 : height * 0.3, width: '100%' },
  image: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: height < 700 ? 30 : 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 0, 0, 0.4)', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: height < 700 ? 20 : 24, marginTop: -30, backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, ...shadows.lg },
  welcomeSection: { marginBottom: height < 700 ? 16 : 32 },
  title: { ...typography.display, fontSize: height < 700 ? 24 : 32, color: colors.navy[900], marginBottom: 4 },
  subtitle: { ...typography.body, color: colors.navy[500] },
  form: { gap: height < 700 ? 12 : 20 },
  inputGroup: { gap: height < 700 ? 4 : 8 },
  inputLabel: { ...typography.micro, color: colors.navy[700], marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navy[50], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.navy[100], paddingHorizontal: 16 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, color: colors.navy[900], fontSize: 16, ...typography.bodyBold },
  forgotPassword: { alignSelf: 'flex-end' },
  forgotPasswordText: { color: colors.primary.base, fontSize: 14, fontWeight: '700' },
  errorText: { color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 4 },
  loginButton: { height: 56, backgroundColor: '#EF4444', borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', ...shadows.md, marginTop: 12 },
  registerText: {
    color: '#0F172A',
    fontWeight: 'bold',
  },

  // Web Admin Styles
  webBg: {
    flex: 1,
    width: '100%',
    height: '100vh',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webLoginBox: {
    width: 440,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  webTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  webInputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  webInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9', // slightly solid to match premium feel
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  webInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    height: '100%',
    outlineStyle: 'none', // Web specific hack
  },
  webLoginButton: {
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    marginTop: 8,
    cursor: 'pointer',
  },
  webLoginButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  devToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: height < 700 ? 8 : 12, backgroundColor: '#F1F5F9', borderRadius: 12, marginTop: height < 700 ? 4 : 8, borderWidth: 1, borderColor: '#E2E8F0' },
  devToggleActive: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  devToggleText: { fontSize: 10, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' },
  devToggleTextActive: { color: '#FFFFFF' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: height < 700 ? 16 : 32, marginBottom: 40 },
  footerText: { color: colors.navy[500], fontSize: 15 },
  signUpText: { color: '#EF4444', fontSize: 15, fontWeight: 'bold' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  stepContainer: { gap: 16 },
  stepDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 8 },
  modalInput: { backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16, height: 56, fontSize: 16, color: '#0F172A' },
  modalBtn: { backgroundColor: '#3B82F6', borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  modalBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  webModalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.7)', 
    justifyContent: 'center', 
    alignItems: 'center',
    // @ts-ignore
    cursor: 'default'
  },
  webModalContent: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 32, 
    width: '90%',
    maxWidth: 440,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 20,
    elevation: 10
  }
});

export default LoginScreen;
