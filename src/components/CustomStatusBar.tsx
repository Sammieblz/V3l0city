import React from 'react';
import { SafeAreaView, StatusBar, StatusBarProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CustomStatusBarProps = StatusBarProps & {
  backgroundColor: string;
};

const CustomStatusBar: React.FC<CustomStatusBarProps> = ({
  backgroundColor,
  ...props
}) => {
  const { top } = useSafeAreaInsets();

  return (
    <View style={{ height: StatusBar.currentHeight ?? top, backgroundColor }}>
      <SafeAreaView style={{ backgroundColor }}>
        <StatusBar translucent backgroundColor={backgroundColor} {...props} />
      </SafeAreaView>
    </View>
  );
};

export default CustomStatusBar;
