package com.cetgo.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * CET Go 的 Android 外壳。
 *
 * ------------------------------------------------------------
 * 设计要点（都不是随手写的，改之前先看这段）：
 *
 * 1) 页面不从 file:// 加载。file:// 是个不透明来源，fetch('/data/words.json')
 *    这种绝对路径请求会被 CORS 拦掉，localStorage 也会被禁用。
 *    这里的做法是给 WebView 一个假的域名 https://cetgo.local/，
 *    然后在 shouldInterceptRequest 里把它整棵映射到 assets/web/ —— 于是
 *    前端一行都不用改，/css /js /data 这些绝对路径原样能用。
 *    （这也是 androidx 的 WebViewAssetLoader 干的事，这里手写一遍省掉依赖。）
 *
 * 2) 没有任何权限，包括 INTERNET。因为「请求」根本不出这个进程，
 *    全部在 shouldInterceptRequest 里就地读 assets 返回。
 *
 * 3) 存档不用 HTTP，走 @JavascriptInterface 桥：shouldInterceptRequest
 *    拿不到请求体，PUT 传不进来。桥是同步的，前端那两行 fetch 换成
 *    NATIVE.loadState() / NATIVE.saveState(json) 就完事。
 *
 * 4) setTextZoom(100) 必须留着。系统「字体大小」设置会改 WebView 的
 *    默认字号，题面那些 clamp() 算出来的尺寸全乱，长释义会被顶出屏幕。
 */
public class MainActivity extends Activity {

    private static final String TAG = "CetGo";
    private static final String ORIGIN = "https://cetgo.local";
    private static final String ASSET_ROOT = "web";

    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("map", "application/json");
        MIME.put("png", "image/png");
        MIME.put("webp", "image/webp");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("txt", "text/plain");
        MIME.put("md", "text/markdown");
    }

    private WebView web;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        win.setStatusBarColor(Color.parseColor("#fdf4ee"));
        win.setNavigationBarColor(Color.parseColor("#4c3542"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 深色状态栏图标，配奶白底
            win.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#fdf4ee"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSaveFormData(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);              // 见类注释第 4 点，别删
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);   // 不联网，没有可查的东西
        }

        web.addJavascriptInterface(new Bridge(), "CetGoNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                Log.d(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#fdf4ee"));
        root.addView(web);
        setContentView(root);

        // Android 13+ 走新的返回回调；更早的版本由 onBackPressed 兜着
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBack);
        }

        web.loadUrl(ORIGIN + "/index.html");
    }

    /* ============================================================
       返回键：先问页面「这一下你处理吗」，页面说不用才真的退出
       ============================================================ */
    private void handleBack() {
        web.evaluateJavascript(
                "(function(){try{return window.__cetgoBack?window.__cetgoBack():false}"
                        + "catch(e){return false}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (!"true".equals(v)) finish();
                    }
                });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 切到后台就存一次，别指望用户每次都乖乖按「退出」
        web.evaluateJavascript(
                "(function(){try{if(window.App&&App.flushSave)App.flushSave()}catch(e){}})()", null);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("CetGoNative");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /* ============================================================
       资源：https://cetgo.local/**  ->  assets/web/**
       ============================================================ */
    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            return serve(req.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serve(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            // 只认自己的假域名；万一页面里有个外链，别在这个壳里打开
            return !req.getUrl().toString().startsWith(ORIGIN);
        }
    }

    private WebResourceResponse serve(String url) {
        if (url == null || !url.startsWith(ORIGIN)) return null;

        String p = url.substring(ORIGIN.length());
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        int h = p.indexOf('#');
        if (h >= 0) p = p.substring(0, h);
        if (p.isEmpty() || p.equals("/")) p = "/index.html";
        else if (p.endsWith("/")) p = p + "index.html";

        // 目录穿越（%2e%2e 之类已经被 URL 解析规整过，这里再挡一道）
        if (p.contains("..")) return notFound();

        try {
            InputStream in = getAssets().open(ASSET_ROOT + p);
            Map<String, String> headers = new HashMap<String, String>();
            // 资源是跟着 APK 走的，URL 却一直不变：一旦让 WebView 缓存，
            // 升级 App 之后会读到上一版的文件。这里干脆不缓存。
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(mimeOf(p), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            Log.w(TAG, "asset miss: " + p);
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null,
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeOf(String p) {
        int dot = p.lastIndexOf('.');
        if (dot < 0) return "application/octet-stream";
        String ext = p.substring(dot + 1).toLowerCase(Locale.US);
        String m = MIME.get(ext);
        return m != null ? m : "application/octet-stream";
    }

    /* ============================================================
       JS 桥：页面里的 window.CetGoNative
       —— 方法都在 WebView 的 JS 线程上被调用，所以别在里面碰 UI，
          要碰就 post 回主线程（quit() 就是这么干的）。
       ============================================================ */
    private class Bridge {

        @JavascriptInterface
        public String loadState() {
            File f = stateFile();
            if (!f.exists()) return null;
            try (InputStream in = new java.io.FileInputStream(f)) {
                byte[] buf = new byte[(int) f.length()];
                int n = 0;
                while (n < buf.length) {
                    int r = in.read(buf, n, buf.length - n);
                    if (r < 0) break;
                    n += r;
                }
                return new String(buf, 0, n, StandardCharsets.UTF_8);
            } catch (IOException e) {
                Log.w(TAG, "loadState failed", e);
                return null;
            }
        }

        /** 先写 tmp 再 rename —— 写一半被系统杀掉也不会把存档写坏。 */
        @JavascriptInterface
        public void saveState(String json) {
            if (json == null) return;
            File tmp = new File(getFilesDir(), "state.json.tmp");
            try {
                try (OutputStreamWriter w = new OutputStreamWriter(
                        new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
                    w.write(json);
                    w.flush();
                }
                File dst = stateFile();
                if (dst.exists() && !dst.delete()) Log.w(TAG, "old state not removed");
                if (!tmp.renameTo(dst)) Log.w(TAG, "state rename failed");
            } catch (IOException e) {
                Log.w(TAG, "saveState failed", e);
            }
        }

        /** 备份一份到「下载」目录，返回给人看的相对路径；失败返回 null。 */
        @JavascriptInterface
        public String backup(String json) {
            if (json == null) return null;
            String name = "CET Go 备份 "
                    + new SimpleDateFormat("yyyy-MM-dd HHmmss", Locale.US).format(new Date())
                    + ".json";
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return null;
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out == null) return null;
                        out.write(json.getBytes(StandardCharsets.UTF_8));
                        out.flush();
                    }
                    return "下载/" + name;
                }
                // Android 9 及以下：应用专属外部目录，不用申请存储权限也写得进去
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                if (!dir.exists() && !dir.mkdirs()) return null;
                File f = new File(dir, name);
                try (OutputStream out = new FileOutputStream(f)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
                return f.getAbsolutePath();
            } catch (Exception e) {
                Log.w(TAG, "backup failed", e);
                return null;
            }
        }

        @JavascriptInterface
        public void quit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }

    private File stateFile() {
        return new File(getFilesDir(), "state.json");
    }
}
