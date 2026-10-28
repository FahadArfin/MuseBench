package io.github.fahadarfin.musebench;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.json.JSONObject;

final class PairingInfo {
    final URI origin;
    final String fingerprint;
    final String secret;
    private PairingInfo(URI origin, String fingerprint, String secret) {
        this.origin = origin; this.fingerprint = fingerprint; this.secret = secret;
    }
    static URI checkedOrigin(String value) throws Exception {
        URI uri = new URI(value);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
            || uri.getPort() < 1 || uri.getPort() > 65535 || uri.getRawQuery() != null
            || uri.getRawFragment() != null || !uri.getRawPath().isEmpty()) {
            throw new IllegalArgumentException("Use the pairing link from your desktop.");
        }
        return uri;
    }
    static PairingInfo parse(String link, long now) throws Exception {
        if (link == null || link.length() > 8192 || !link.startsWith("musebench://pair?data="))
            throw new IllegalArgumentException("Use the pairing link from your desktop.");
        String encoded = link.substring("musebench://pair?data=".length());
        if (!encoded.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("Invalid pairing link.");
        JSONObject value = new JSONObject(new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8));
        long expires = value.getLong("expiresAt");
        String pin = value.getString("fingerprint"), secret = value.getString("secret");
        if (value.getInt("version") != 1 || expires <= now || expires > now + 660000
            || !pin.matches("[a-f0-9]{64}") || !secret.matches("[A-Za-z0-9_-]{43}"))
            throw new IllegalArgumentException("This pairing code is invalid or expired. Create a new one on your desktop.");
        return new PairingInfo(checkedOrigin(value.getString("url")), pin, secret);
    }
}
