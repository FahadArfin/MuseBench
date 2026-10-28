import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {BrowserPreviewContext} from './BrowserPreviewContext';
import {UI_FONT_FAMILY,MONO_FONT_FAMILY} from '../shared/typography.mjs';
import './typography.css';
import './styles.css';
import './brand.css';
import './sidebar.css';
import './window-chrome.css';

// Both entry points use this exact component tree and stylesheet order.
export function mountApp(preview?:React.ContextType<typeof BrowserPreviewContext>){
 document.documentElement.style.setProperty('--font-ui',UI_FONT_FAMILY);
 document.documentElement.style.setProperty('--mono-font',MONO_FONT_FAMILY);
 createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserPreviewContext.Provider value={preview??{}}><App/></BrowserPreviewContext.Provider></React.StrictMode>);
}
