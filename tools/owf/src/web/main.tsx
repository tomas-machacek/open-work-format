import { createRoot } from 'react-dom/client';
import { Board } from './Board.js';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<Board />);
