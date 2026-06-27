import React from 'react';
import { renderToString } from 'react-dom/server';
import { Swipeable } from 'react-native-gesture-handler';

console.log("Swipeable type:", typeof Swipeable);
console.log("Is Swipeable an object?", typeof Swipeable === 'object');
console.log("Swipeable stringified:", JSON.stringify(Swipeable));

try {
  const html = renderToString(<Swipeable />);
  console.log('RENDER SUCCESS');
} catch (e) {
  console.log('RENDER ERROR:', e.message);
}
