import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/globals.css';
import '../styles/home.css';
import '../styles/file-sharing.css';
import '../styles/link.css';
import '../styles/view.css';
import '../styles/about.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
