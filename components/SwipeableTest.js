import React from 'react';
import { Swipeable } from 'react-native-gesture-handler';
import { View, Text } from 'react-native';

export const SwipeableTest = () => (
  <Swipeable renderRightActions={() => <Text>Right</Text>}>
    <View><Text>Test</Text></View>
  </Swipeable>
);
