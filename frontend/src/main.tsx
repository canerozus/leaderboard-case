import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center">
      <p>Leaderboard Case — bootstrapping…</p>
    </div>
  </StrictMode>,
);
