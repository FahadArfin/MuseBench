package io.github.fahadarfin.musebench;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.webkit.*;
import android.widget.*;
import android.view.ViewGroup;

/** Provider pages have their own WebView with no MuseMobile bridge. */
public class ChatActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> upload;
    private String home;
    static boolean providerUrl(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null) return false;
        String host = uri.getHost(); if (host == null) return false;
        if (host.equals("auth.meta.com")) return true;
        for (String root : new String[]{"meta.ai", "muse.ai", "facebook.com", "instagram.com"}) {
            if (host.equals(root) || host.endsWith("." + root)) return true;
        }
        return false;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        home = "muse".equals(getIntent().getStringExtra("service")) ? "https://muse.ai/" : "https://www.meta.ai/";
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setBackgroundColor(Color.rgb(21, 23, 27));
        layout.setOnApplyWindowInsetsListener((view, insets) -> { view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets.consumeSystemWindowInsets(); });
        LinearLayout toolbar = new LinearLayout(this);
        Button back = new Button(this); back.setText("‹ MuseBench"); back.setOnClickListener(v -> finish()); toolbar.addView(back, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button browser = new Button(this); browser.setText("Open in browser ↗"); browser.setOnClickListener(v -> external(web == null ? home : web.getUrl())); toolbar.addView(browser, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        layout.addView(toolbar); web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1)); setContentView(layout);
        MainActivity.configure(web); CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (providerUrl(request.getUrl())) return false;
                if (request.isForMainFrame()) external(request.getUrl().toString()); return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams parameters) {
                if (upload != null) upload.onReceiveValue(null); upload = callback;
                try { startActivityForResult(parameters.createIntent(), 82); }
                catch (Exception failure) { upload.onReceiveValue(null); upload = null; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, size) -> external(url));
        if (state == null || web.restoreState(state) == null) web.loadUrl(home);
    }
    private void external(String value) {
        try { Uri uri = Uri.parse(value == null ? home : value); if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null) return; startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (Exception failure) { Toast.makeText(this, "Install a browser to open this link.", Toast.LENGTH_SHORT).show(); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        if (request == 82 && upload != null) { upload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); upload = null; }
        else super.onActivityResult(request, result, data);
    }
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); if (web != null) web.saveState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { if (upload != null) upload.onReceiveValue(null); if (web != null) web.destroy(); super.onDestroy(); }
}
