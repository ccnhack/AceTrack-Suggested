import React from 'react';
import { renderToString } from 'react-dom/server';
import { SupportTicketSystem } from './components/SupportTicketSystem';

try {
  const html = renderToString(<SupportTicketSystem />);
  console.log('RENDER SUCCESS');
} catch (e) {
  console.log('RENDER ERROR:', e);
}
