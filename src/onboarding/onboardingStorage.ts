import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_ONBOARDING_KEY = 'v3l0city:onboarding:local:v1';

export type LocalOnboardingState = {
  completedAt: string | null;
  version: 1;
};

const emptyState = (): LocalOnboardingState => ({
  completedAt: null,
  version: 1,
});

export const getLocalOnboardingState =
  async (): Promise<LocalOnboardingState> => {
    const raw = await AsyncStorage.getItem(LOCAL_ONBOARDING_KEY);
    if (!raw) {
      return emptyState();
    }

    try {
      const parsed = JSON.parse(raw) as Partial<LocalOnboardingState>;
      return {
        completedAt:
          typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
        version: 1,
      };
    } catch {
      return emptyState();
    }
  };

export const hasCompletedLocalOnboarding = async () => {
  const state = await getLocalOnboardingState();
  return state.completedAt != null;
};

export const markLocalOnboardingComplete = async (completedAt = new Date()) => {
  const state: LocalOnboardingState = {
    completedAt: completedAt.toISOString(),
    version: 1,
  };
  await AsyncStorage.setItem(LOCAL_ONBOARDING_KEY, JSON.stringify(state));
  return state;
};

export const resetLocalOnboardingForTests = async () => {
  await AsyncStorage.removeItem(LOCAL_ONBOARDING_KEY);
};
