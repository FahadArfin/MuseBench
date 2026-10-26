import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {BrowserPreviewContext} from './BrowserPreviewContext';
import './styles.css';
import './brand.css';
import './sidebar.css';
import './window-chrome.css';

// Both entry points use this exact component tree and stylesheet order.
export function mountApp(preview?:React.ContextType<typeof BrowserPreviewContext>){
 createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserPreviewContext.Provider value={preview??{}}><App/></BrowserPreviewContext.Provider></React.StrictMode>);
}
