export function createStartupFailureHandler({ app, dialog, getWindow }) {
  let quitting = false;
  // Register before asynchronous startup: quitting can reject the first
  // loadURL with ERR_FAILED even though the local document is valid.
  app.once('before-quit', () => { quitting = true; });
  return error => {
    if (quitting || getWindow()?.isDestroyed()) return;
    dialog.showErrorBox('MuseBench could not start', error?.message || String(error));
    app.quit();
  };
}
