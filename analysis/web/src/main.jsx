import React from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import './pdfLifecycle.js'; // installs the pdf.js teardown rejection guard
import Workbench from './Workbench.jsx';

createRoot(document.getElementById('root')).render(<Workbench/>);
