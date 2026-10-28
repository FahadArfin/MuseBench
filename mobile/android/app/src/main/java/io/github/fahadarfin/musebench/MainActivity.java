package io.github.fahadarfin.musebench;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.net.Uri;
import android.view.WindowInsets;
import android.webkit.*;
import android.graphics.Color;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.view.ViewGroup;
import androidx.webkit.*;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView view;
    private PairingStore store;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private JavaScriptReplyProxy scanReply;
    private String scanId;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new PairingStore(this);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView message = new TextView(this); message.setText("Update Android System WebView to open MuseBench.");
            message.setPadding(32, 64, 32, 32); setContentView(message); return;
        }
        // WebView padding does not inset its HTML viewport. Apply system bars
        // to a native parent so fixed headers and composers fit the safe area.
        FrameLayout layout = new FrameLayout(this); layout.setBackgroundColor(Color.rgb(21, 23, 27));
        view = new WebView(this); view.setBackgroundColor(Color.rgb(21, 23, 27));
        layout.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        layout.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(layout);
        configure(view);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                return response != null ? response : new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) { return true; }
            @Override public void onReceivedSslError(WebView web, SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
        WebViewCompat.addWebMessageListener(view, "MuseMobile", Collections.singleton(ORIGIN), (web, message, origin, mainFrame, reply) -> {
            if (!mainFrame || !ORIGIN.equals(origin.toString())) return;
            String text = message.getData();
            if (text == null || text.length() > 70000) return;
            try {
                JSONObject request = new JSONObject(text); String id = request.getString("id"), method = request.getString("method");
                if (!id.matches("[a-f0-9-]{36}")) return;
                JSONObject input = request.optJSONObject("input"); if (input == null) input = new JSONObject();
                if (method.equals("scan")) {
                    if (scanReply != null) { respond(reply, id, null, "Finish the current scan first."); return; }
                    scanReply = reply; scanId = id;
                    new IntentIntegrator(this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                        .setPrompt("Scan MuseBench’s pairing code").setBeepEnabled(false).setOrientationLocked(false).initiateScan();
                } else if (method.equals("openChat")) {
                    String service = input.optString("service");
                    if (!service.equals("muse") && !service.equals("meta")) { respond(reply, id, null, "Unknown chat service."); return; }
                    startActivity(new Intent(this, ChatActivity.class).putExtra("service", service)); respond(reply, id, true, null);
                } else {
                    JSONObject arguments = input;
                    worker.execute(() -> {
                        try { Object value = dispatch(method, arguments); respond(reply, id, value, null); }
                        catch (Exception failure) { respond(reply, id, null, safeError(failure)); }
                    });
                }
            } catch (Exception invalid) { /* Malformed messages cannot invoke native actions. */ }
        });
        view.loadUrl(ORIGIN + "/assets/index.html");
    }
    static void configure(WebView web) {
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
    private JSONObject status() throws Exception {
        JSONObject saved = store.read();
        return saved == null ? new JSONObject().put("paired", false) : new JSONObject().put("paired", true).put("name", saved.getString("name")).put("url", saved.getString("url"));
    }
    JSONObject pair(String link) throws Exception {
        PairingInfo info = PairingInfo.parse(link.trim(), System.currentTimeMillis());
        JSONObject paired = PinnedClient.request(info.origin.toString(), info.fingerprint, info.secret, "/v1/pair",
            new JSONObject().put("name", (Build.MANUFACTURER + " " + Build.MODEL).substring(0, Math.min(80, (Build.MANUFACTURER + " " + Build.MODEL).length()))));
        if (paired.getInt("protocol") != 1 || !paired.getString("token").matches("[A-Za-z0-9_-]{43}")) throw new Exception("Unsupported desktop connection.");
        store.write(new JSONObject().put("url", info.origin.toString()).put("fingerprint", info.fingerprint)
            .put("token", paired.getString("token")).put("name", paired.getString("name")));
        return status();
    }
    private Object dispatch(String method, JSONObject input) throws Exception {
        if (method.equals("connection")) return status();
        if (method.equals("pair")) return pair(input.getString("link"));
        if (method.equals("forget")) { store.clear(); return true; }
        JSONObject saved = store.read(); if (saved == null) throw new Exception("Pair your desktop first.");
        String route; JSONObject body = null;
        switch (method) {
            case "state": route = "/v1/state"; break;
            case "chat":
                String taskId = input.getString("taskId"), before = input.optString("before", "");
                if (!taskId.matches("[\\w-]{1,100}") || (!before.isEmpty() && !before.matches("[\\w-]{1,100}"))) throw new Exception("Invalid chat.");
                route = "/v1/chat?taskId=" + taskId + (before.isEmpty() ? "" : "&before=" + before); break;
            case "command":
                if (!input.optString("kind").matches("select|send|stop")) throw new Exception("Unknown desktop action.");
                route = "/v1/command"; body = input; break;
            default: throw new Exception("Unknown companion action.");
        }
        return PinnedClient.request(saved.getString("url"), saved.getString("fingerprint"), saved.getString("token"), route, body);
    }
    private static String safeError(Exception failure) {
        if (failure instanceof javax.net.ssl.SSLException) return "Desktop certificate could not be verified. Create a new pairing code on your desktop.";
        if (failure instanceof java.io.IOException) return "Could not reach your desktop. Check that MuseBench’s connection is on and both devices share a network or VPN.";
        String message = failure.getMessage(); return message == null ? "Could not complete this request." : message.substring(0, Math.min(300, message.length()));
    }
    private void respond(JavaScriptReplyProxy reply, String id, Object value, String error) {
        runOnUiThread(() -> { if (isFinishing() || isDestroyed()) return; try {
            JSONObject response = new JSONObject().put("id", id).put("ok", error == null);
            if (error == null) response.put("value", value == null ? JSONObject.NULL : value); else response.put("error", error);
            reply.postMessage(response.toString());
        } catch (Exception ignored) {} });
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (result == null) { super.onActivityResult(requestCode, resultCode, data); return; }
        JavaScriptReplyProxy reply = scanReply; String id = scanId; scanReply = null; scanId = null;
        if (reply == null) return;
        if (result.getContents() == null) { respond(reply, id, null, "Scan cancelled. You can also paste the pairing link."); return; }
        worker.execute(() -> { try { respond(reply, id, pair(result.getContents()), null); } catch (Exception failure) { respond(reply, id, null, safeError(failure)); } });
    }
    @Override protected void onDestroy() { worker.shutdown(); if (view != null) { view.destroy(); view = null; } super.onDestroy(); }
}
