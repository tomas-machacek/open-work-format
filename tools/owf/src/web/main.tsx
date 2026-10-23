import { createRoot } from 'react-dom/client';
import { Workspace } from './Workspace.js';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<Workspace />);
