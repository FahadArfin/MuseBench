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
import './motion.css';
import {observeMotionPreference} from './motion.mjs';
import {readPreferences} from './preferences.mjs';
import {LaunchExperience} from './LaunchAnimation';

// Both entry points use this exact component tree and stylesheet order.
export function mountApp(preview?:React.ContextType<typeof BrowserPreviewContext>){
 document.documentElement.dataset.reducedMotion=String(readPreferences().reducedMotion);
 observeMotionPreference();
 document.documentElement.style.setProperty('--font-ui',UI_FONT_FAMILY);
 document.documentElement.style.setProperty('--mono-font',MONO_FONT_FAMILY);
 // The native one-shot claim survives renderer reloads. Preview replay is explicit.
 const launch = window.musebench?.launch?.active === true || Boolean(preview && new URLSearchParams(location.search).get('launch') === '1');
 if(launch)document.documentElement.dataset.launchActive='true';
 createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserPreviewContext.Provider value={preview??{}}><LaunchExperience enabled={launch}><App/></LaunchExperience></BrowserPreviewContext.Provider></React.StrictMode>);
}
