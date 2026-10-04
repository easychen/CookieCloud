import React from 'react';
import { createRoot } from 'react-dom/client';
import CookieCloudPopup from './App';
import './style.css';
import { initialize_theme } from '../../utils/theme';

initialize_theme();

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<CookieCloudPopup />);
}
