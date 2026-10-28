package io.github.fahadarfin.musebench;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Tokens remain in the Android Keystore boundary and never enter the web UI. */
final class PairingStore {
    private static final String ALIAS = "musebench.companion.v1";
    private final SharedPreferences preferences;
    PairingStore(Context context) { preferences = context.getSharedPreferences("companion", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    synchronized JSONObject read() throws Exception {
        String data = preferences.getString("data", null), iv = preferences.getString("iv", null);
        if (data == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8));
        } catch (Exception failure) { throw new Exception("Could not unlock the desktop connection. Disconnect and pair again."); }
    }
    synchronized void write(JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] bytes = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        if (!preferences.edit().putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).commit()) throw new Exception("Could not save this connection.");
    }
    synchronized void clear() throws Exception {
        if (!preferences.edit().clear().commit()) throw new Exception("Could not remove this connection.");
    }
}
