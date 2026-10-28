package io.github.fahadarfin.musebench;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.security.cert.CertificateException;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.json.JSONObject;

/** Every connection is bound to the certificate scanned from the desktop. No global TLS overrides. */
final class PinnedClient {
    private static byte[] pinBytes(String pin) {
        if (!pin.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid desktop certificate.");
        byte[] result = new byte[32];
        for (int i = 0; i < result.length; i++) result[i] = (byte) Integer.parseInt(pin.substring(i * 2, i * 2 + 2), 16);
        return result;
    }
    static JSONObject request(String origin, String pin, String token, String route, JSONObject body) throws Exception {
        URI base = PairingInfo.checkedOrigin(origin);
        if (!route.startsWith("/v1/") || route.startsWith("//") || !token.matches("[A-Za-z0-9_-]{43}")) throw new Exception("Invalid desktop request.");
        byte[] expected = pinBytes(pin);
        X509TrustManager trust = new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String auth) throws CertificateException { throw new CertificateException("Client certificate unsupported."); }
            public void checkServerTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                try {
                    if (chain == null || chain.length == 0) throw new CertificateException("Missing certificate.");
                    chain[0].checkValidity();
                    if (!MessageDigest.isEqual(expected, MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded())))
                        throw new CertificateException("Desktop certificate changed. Pair again from your desktop.");
                } catch (CertificateException failure) { throw failure; }
                catch (Exception failure) { throw new CertificateException("Could not verify desktop certificate.", failure); }
            }
        };
        SSLContext tls = SSLContext.getInstance("TLS"); tls.init(null, new TrustManager[]{trust}, null);
        HttpsURLConnection connection = (HttpsURLConnection) new URI(origin + route).toURL().openConnection();
        connection.setSSLSocketFactory(tls.getSocketFactory());
        // The scanned fingerprint is the identity, while the address is a LAN/VPN route.
        connection.setHostnameVerifier((host, session) -> {
            if (!base.getHost().equalsIgnoreCase(host)) return false;
            try { return MessageDigest.isEqual(expected, MessageDigest.getInstance("SHA-256").digest(session.getPeerCertificates()[0].getEncoded())); }
            catch (Exception failure) { return false; }
        });
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(12000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 70000) throw new Exception("Message is too large.");
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(bytes.length);
                try (var output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new Exception("Desktop redirects are not allowed. Pair again from your desktop.");
            try (InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
                if (stream == null) throw new Exception("The desktop did not return a response.");
                ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] chunk = new byte[8192]; int count;
                while ((count = stream.read(chunk)) != -1) { if (output.size() + count > 512 * 1024) throw new Exception("Desktop response is too large."); output.write(chunk, 0, count); }
                JSONObject value = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
                if (status >= 400) throw new Exception(value.optString("error", "Desktop request failed.").substring(0, Math.min(300, value.optString("error", "Desktop request failed.").length())));
                return value;
            }
        } finally { connection.disconnect(); }
    }
}
