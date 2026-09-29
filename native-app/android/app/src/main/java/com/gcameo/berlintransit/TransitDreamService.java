package com.gcameo.berlintransit;

import android.graphics.Color;
import android.service.dreams.DreamService;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import java.io.IOException;
import java.io.InputStream;

/**
 * Android system screensaver (Settings → Display → Screen saver).
 *
 * Shows the bundled web app (assets/public, copied there by `npx cap sync`)
 * in screensaver mode. Files are served from https://localhost — the same
 * origin the Capacitor app uses — so the page shares the app's localStorage
 * and starts at the station last picked in the app. API calls go to the
 * network as usual.
 */
public class TransitDreamService extends DreamService {

    private static final String START_URL = "https://localhost/index.html?screensaver=1";

    private WebView webView;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false); // any touch ends the screensaver
        setFullscreen(true);
        setScreenBright(false);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .setDomain("localhost")
            .addPathHandler("/", new PublicAssetsHandler())
            .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
            }
        );
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (webView != null) webView.onResume();
    }

    @Override
    public void onDreamingStopped() {
        if (webView != null) webView.onPause();
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDetachedFromWindow();
    }

    /** Serves /<path> from assets/public/<path>; unknown paths fall through (null). */
    private class PublicAssetsHandler implements WebViewAssetLoader.PathHandler {

        @Override
        public WebResourceResponse handle(@NonNull String path) {
            if (path.isEmpty()) path = "index.html";
            try {
                InputStream in = getAssets().open("public/" + path);
                return new WebResourceResponse(mimeType(path), null, in);
            } catch (IOException e) {
                return null;
            }
        }

        private String mimeType(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }
    }
}
