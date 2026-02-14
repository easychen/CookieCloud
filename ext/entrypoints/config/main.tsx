import React from 'react';
import { createRoot } from 'react-dom/client';
import CookieCloudPopup from './App';
import './style.css';

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<CookieCloudPopup />);
}