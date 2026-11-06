import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimLab } from './app/AnimLab';
import './ui.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <StrictMode>
    <AnimLab />
  </StrictMode>,
);
