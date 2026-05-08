import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography, borderRadius, shadows } from '../theme/designSystem';

class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // In a real app, log this error to an error reporting service (e.g., Sentry, Crashlytics)
    console.error("ScreenErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Oops! Something went wrong.</Text>
          <Text style={styles.subtitle}>
            We've encountered an unexpected error on this screen. Our team has been notified.
          </Text>
          {this.state.error && (
            <ScrollView style={styles.errorBox}>
              <Text style={styles.errorText}>
                {this.state.error.toString()}{'\n'}
                {this.state.errorInfo?.componentStack}
              </Text>
            </ScrollView>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.navy[50],
  },
  title: {
    ...typography.h2,
    color: colors.navy[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.navy[500],
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBox: {
    maxHeight: 200,
    width: '100%',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 24,
  },
  errorText: {
    color: '#DC2626',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  button: {
    backgroundColor: colors.primary.base,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ScreenErrorBoundary;
