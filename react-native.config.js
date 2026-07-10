module.exports = {
  dependencies: {
    // V3l0city v1.0.0 does not ship CarPlay or Android Auto. Keep the
    // simulator POC source available, but do not autolink its native modules,
    // services, permissions, or Pods into store builds.
    'react-native-carplay': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
