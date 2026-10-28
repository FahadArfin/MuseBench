package io.github.fahadarfin.musebench;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CompanionTest {
    @Test public void nativeTlsPinPairingProtectedPersistenceAndRetry() throws Exception {
        String link = InstrumentationRegistry.getArguments().getString("pairLink");
        assertNotNull("The emulator test requires its isolated desktop fixture.", link);
        PairingInfo info = PairingInfo.parse(link, System.currentTimeMillis());
        String wrong = "0".equals(info.fingerprint.substring(0, 1)) ? "1" + info.fingerprint.substring(1) : "0" + info.fingerprint.substring(1);
        assertThrows(Exception.class, () -> PinnedClient.request(info.origin.toString(), wrong, info.secret, "/v1/pair", new JSONObject().put("name", "Test tablet")));
        JSONObject paired = PinnedClient.request(info.origin.toString(), info.fingerprint, info.secret, "/v1/pair", new JSONObject().put("name", "Test tablet"));
        String token = paired.getString("token");
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PairingStore store = new PairingStore(context);
        store.write(new JSONObject().put("token", token).put("url", info.origin.toString()).put("fingerprint", info.fingerprint).put("name", paired.getString("name")));
        assertEquals(token, new PairingStore(context).read().getString("token"));
        assertFalse(context.getSharedPreferences("companion", Context.MODE_PRIVATE).getAll().toString().contains(token));
        JSONObject command = new JSONObject().put("kind", "send").put("taskId", "chat-one").put("text", "Hello from emulator")
            .put("requestId", UUID.randomUUID().toString()).put("issuedAt", System.currentTimeMillis());
        PinnedClient.request(info.origin.toString(), info.fingerprint, token, "/v1/command", command);
        PinnedClient.request(info.origin.toString(), info.fingerprint, token, "/v1/command", command);
        JSONObject state = PinnedClient.request(info.origin.toString(), info.fingerprint, token, "/v1/state", null);
        assertEquals(1, state.getInt("testCommandCount"));
        assertEquals("chat-one", state.getJSONArray("chats").getJSONObject(0).getString("id"));
        assertThrows(Exception.class, () -> PinnedClient.request(info.origin.toString(), info.fingerprint, info.secret, "/v1/pair", new JSONObject().put("name", "Again")));
        store.clear(); assertNull(new PairingStore(context).read());
    }
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { WebView found = findWeb(((ViewGroup) view).getChildAt(i)); if (found != null) return found; }
        return null;
    }
    @Test public void bundledUiHasBridgeAndProviderChatNeverDoes() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.currentTimeMillis() + 20000; String result = "";
            while (System.currentTimeMillis() < deadline && !result.contains("Your desktop")) {
                CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> captured = new AtomicReference<>("");
                scenario.onActivity(activity -> findWeb(activity.getWindow().getDecorView()).evaluateJavascript("JSON.stringify({bridge:typeof window.MuseMobile,text:document.body.innerText})", value -> { captured.set(value); latch.countDown(); }));
                assertTrue(latch.await(4, TimeUnit.SECONDS)); result = captured.get();
                if (result.contains("What’s on your mind?")) break;
                Thread.sleep(100);
            }
            assertTrue(result, result.contains("object"));
            assertTrue(result, result.contains("Muse AI"));
            scenario.onActivity(activity -> {
                WebView web = findWeb(activity.getWindow().getDecorView());
                int[] position = new int[2]; web.getLocationOnScreen(position);
                android.view.WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
                assertNotNull(insets);
                assertTrue("App controls must stay below the status bar", position[1] >= insets.getSystemWindowInsetTop());
                int screenHeight = activity.getWindow().getDecorView().getHeight();
                assertTrue("App controls must stay above the navigation bar", position[1] + web.getHeight() <= screenHeight - insets.getSystemWindowInsetBottom());
            });
        }
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (ActivityScenario<ChatActivity> scenario = ActivityScenario.launch(new Intent(context, ChatActivity.class).putExtra("service", "meta"))) {
            CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> captured = new AtomicReference<>();
            scenario.onActivity(activity -> findWeb(activity.getWindow().getDecorView()).evaluateJavascript("typeof window.MuseMobile", value -> { captured.set(value); latch.countDown(); }));
            assertTrue(latch.await(10, TimeUnit.SECONDS)); assertEquals("\"undefined\"", captured.get());
        }
        assertFalse(ChatActivity.providerUrl(Uri.parse("https://meta.ai.attacker.invalid/")));
        assertFalse(ChatActivity.providerUrl(Uri.parse("http://www.meta.ai/")));
        assertTrue(ChatActivity.providerUrl(Uri.parse("https://www.meta.ai/")));
    }
}
