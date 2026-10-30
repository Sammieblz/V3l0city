import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { colors, fontFamilies, spacing } from '../theme/paperTheme';
import { useThemedStyles } from '../theme/appTheme';
import type { PersonalRecordingState } from './controller';

export function RecordingNotice({ recording, readError, allowResume, onResume, onRetry, onReadRetry }: {
  recording: PersonalRecordingState;
  readError: string | null;
  allowResume: boolean;
  onResume: () => void;
  onRetry: () => void;
  onReadRetry: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  if (!recording.error && !readError && !recording.recovered && !recording.session?.gaps.length
    && recording.session?.state !== 'paused') return null;
  return <View style={styles.container}>
    {readError && <View>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.message}>{readError}</Text>
      <Button onPress={onReadRetry} disabled={recording.busy}>Retry device data</Button>
    </View>}
    {recording.error && <View>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.message}>{recording.error}</Text>
      <Button onPress={onRetry} disabled={recording.busy} loading={recording.busy}>Retry recording</Button>
    </View>}
    {recording.recovered && <Text accessibilityLiveRegion="polite" style={styles.message}>
      Recovered unfinished trip. Recording is paused. Last confirmed data is kept; samples may be missing during the interruption.
      {recording.remainingRecovered > 0 ? ` ${recording.remainingRecovered} other unfinished trip(s) remain to review.` : ''}
    </Text>}
    {!!recording.session?.gaps.length && !recording.recovered && <Text style={styles.message}>
      This trip includes paused or interrupted intervals. Missing samples are not reconstructed.
    </Text>}
    {recording.session?.state === 'paused' && <Button mode="contained-tonal" onPress={onResume}
      disabled={!allowResume || recording.busy || !!recording.error} accessibilityLabel="Resume recording">
      Resume recording
    </Button>}
  </View>;
}

const createStyles = () => StyleSheet.create({
  container: { gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, maxWidth: 420 },
  message: { color: colors.textPrimary, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 19 },
});
