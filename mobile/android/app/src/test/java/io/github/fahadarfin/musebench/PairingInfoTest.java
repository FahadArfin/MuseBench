package io.github.fahadarfin.musebench;

import org.json.JSONObject;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import static org.junit.Assert.*;

public class PairingInfoTest {
    private JSONObject payload() throws Exception {
        return new JSONObject().put("version", 1).put("url", "https://192.168.1.5:43210")
            .put("fingerprint", "a".repeat(64)).put("secret", "b".repeat(43))
            .put("expiresAt", System.currentTimeMillis() + 600000);
    }
    private String link(JSONObject value) {
        return "musebench://pair?data=" + Base64.getUrlEncoder().withoutPadding()
            .encodeToString(value.toString().getBytes(StandardCharsets.UTF_8));
    }
    @Test public void validLinkBindsOriginCertificateAndSingleUseCredential() throws Exception {
        PairingInfo info = PairingInfo.parse(link(payload()), System.currentTimeMillis());
        assertEquals("192.168.1.5", info.origin.getHost());
        assertEquals(43210, info.origin.getPort());
        assertEquals(64, info.fingerprint.length());
    }
    @Test public void rejectsExpiredUnpinnedAndRedirectableOrigins() throws Exception {
        for (String url : new String[]{"http://192.168.1.5:43210", "https://user:pass@localhost:43210", "https://localhost:43210/other", "https://localhost:43210?token=x", "https://localhost:43210#x", "https://localhost"}) {
            JSONObject value = payload().put("url", url);
            assertThrows(Exception.class, () -> PairingInfo.parse(link(value), System.currentTimeMillis()));
        }
        JSONObject expired = payload().put("expiresAt", System.currentTimeMillis() - 1);
        assertThrows(Exception.class, () -> PairingInfo.parse(link(expired), System.currentTimeMillis()));
        JSONObject noPin = payload().put("fingerprint", "*");
        assertThrows(Exception.class, () -> PairingInfo.parse(link(noPin), System.currentTimeMillis()));
        assertThrows(Exception.class, () -> PairingInfo.parse("https://example.com/", System.currentTimeMillis()));
    }
}
