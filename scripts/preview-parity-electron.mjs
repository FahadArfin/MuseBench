import {app} from 'electron';
if(!process.env.MUSEBENCH_PARITY_DATA)throw Error('Run through test:preview-parity');
app.setPath('userData',process.env.MUSEBENCH_PARITY_DATA);
// The runner creates the window after Playwright attaches its target listener.
app.whenReady().then(()=>{});
