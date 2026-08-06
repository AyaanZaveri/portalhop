package app.portalhop.mobile;

import android.os.Build;
import android.os.Bundle;
import android.view.RoundedCorner;
import android.view.WindowInsets;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    /**
     * Publishes the display's physical corner radius to CSS as
     * --display-corner-radius.
     *
     * Bottom sheets sit flush against the bottom of the screen, so their corners
     * have to end on the same curve the hardware does or the display clips them
     * and the sheet looks cut off. The web layer has no way to read this, and a
     * hardcoded radius is wrong on every device that doesn't happen to match.
     * Android exposes it from API 31; below that the CSS default applies.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return;
        }

        WebView webView = getBridge().getWebView();
        // Posted because the window has no insets attached until it is laid out.
        webView.post(() -> {
            WindowInsets insets = webView.getRootWindowInsets();
            if (insets == null) {
                return;
            }

            RoundedCorner corner = insets.getRoundedCorner(RoundedCorner.POSITION_BOTTOM_LEFT);
            if (corner == null) {
                corner = insets.getRoundedCorner(RoundedCorner.POSITION_BOTTOM_RIGHT);
            }
            if (corner == null) {
                return;
            }

            // getRadius() is in physical pixels; CSS works in density-independent ones.
            float radiusDp = corner.getRadius() / getResources().getDisplayMetrics().density;

            webView.evaluateJavascript(
                String.format(
                    Locale.US,
                    "document.documentElement.style.setProperty('--display-corner-radius','%.1fpx');",
                    radiusDp
                ),
                null
            );
        });
    }
}
