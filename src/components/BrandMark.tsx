import React from 'react';
import {
  Image,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
} from 'react-native';

type BrandMarkProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

const brandMarkSource = require('../../assets/images/brand-mark.png');

const BrandMark: React.FC<BrandMarkProps> = ({ size = 36, style }) => (
  <Image
    accessibilityIgnoresInvertColors
    accessibilityLabel="V3l0city logo"
    source={brandMarkSource}
    style={[styles.image, { height: size, width: size }, style]}
  />
);

const styles = StyleSheet.create({
  image: {
    resizeMode: 'contain',
  },
});

export default BrandMark;
