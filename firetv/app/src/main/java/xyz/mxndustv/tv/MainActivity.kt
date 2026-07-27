package xyz.mxndustv.tv

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Contenedor WebView de MexNodus TV para Fire TV.
 *
 * La app NO reimplementa el catálogo ni el reproductor: carga la superficie /tv
 * de la web. Lo que sí aporta, y no se puede hacer desde el navegador, es:
 *
 *  1. Bloquear los popups de los proveedores de embed (`onCreateWindow`).
 *  2. Reenviar las teclas de reproducción del mando, que en Fire OS no llegan
 *     al DOM como `keydown`.
 *  3. Simular un toque real sobre el `<iframe>` cuando la fuente es un embed —
 *     la única forma de dar play dentro de un iframe de otro origen.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var container: FrameLayout

    /** Vista a pantalla completa que pide el `<video>` vía `onShowCustomView`. */
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        container = FrameLayout(this)
        setContentView(container)

        webView = WebView(this)
        container.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        // Fondo obsidiana desde el primer fotograma: sin esto el WebView pinta
        // blanco mientras carga y en una tele oscura el destello es brutal.
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.mx_bg))

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // El autoplay del player (hls.js llama a video.play() en
            // MANIFEST_PARSED) no cuenta como gesto de usuario: sin esto el
            // vídeo se queda en el primer fotograma.
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            // El token que el middleware busca para redirigir la raíz a /tv.
            userAgentString = "$userAgentString $TV_USER_AGENT_TOKEN$APP_VERSION"
        }

        // La pantalla no debe apagarse durante una película.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView.webViewClient = object : WebViewClient() {
            /**
             * Todo lo de nuestro dominio se queda dentro. Cualquier otra cosa se
             * descarta en vez de abrirse: un embed que intenta navegar la ventana
             * principal a una página de anuncios secuestraría la app entera, y en
             * una tele el usuario no tiene barra de direcciones para volver.
             */
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Petición de la web para que demos un toque real en el centro:
                // es la única forma de dar play dentro de un iframe de otro
                // origen. Se exige `isForMainFrame` para que un proveedor de
                // embed no pueda dispararlo desde dentro de su propio iframe.
                if (request.url.scheme == HOST_SCHEME) {
                    if (request.isForMainFrame) {
                        when (request.url.host) {
                            // Coordenadas exactas del centro del iframe, que es
                            // donde el proveedor dibuja su botón de play.
                            "tap" -> {
                                val x = request.url.getQueryParameter("x")?.toFloatOrNull()
                                val y = request.url.getQueryParameter("y")?.toFloatOrNull()
                                if (x != null && y != null) webView.post { tapAt(x, y) }
                                else webView.post { tapCenter() }
                            }
                            "tap-center" -> webView.post { tapCenter() }
                        }
                    }
                    return true // en cualquier caso, no se navega a mxtv://
                }
                val host = request.url.host ?: return true
                return !host.endsWith(APP_HOST)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            /**
             * Bloqueo de popups.
             *
             * El `<iframe>` de los proveedores va SIN atributo `sandbox` a
             * propósito (varios detectan el atributo y se niegan a reproducir),
             * así que el bloqueo se resuelve aquí, en el host nativo — que es
             * justo lo que anticipa el comentario de src/lib/security/embed-shield.ts.
             * Devolver false descarta la ventana solicitada.
             */
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message,
            ): Boolean = false

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                // A la raíz de la ventana, NO al contenedor del WebView: colgada
                // de un FrameLayout anidado, la vista de pantalla completa
                // heredaba las medidas del WebView y pintaba el vídeo a 1:1 en
                // la esquina superior izquierda en vez de escalarlo al panel.
                view.setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.mx_bg))
                (window.decorView as FrameLayout).addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    ),
                )
                webView.visibility = View.GONE
            }

            override fun onHideCustomView() {
                hideCustomView()
            }
        }

        webView.loadUrl(BASE_URL)
    }

    /**
     * Saca el vídeo de pantalla completa.
     *
     * Vive aquí, y no solo dentro del `WebChromeClient`, porque el botón atrás
     * también tiene que poder llamarlo. Leerlo con `webView.webChromeClient` NO
     * vale: ese getter apareció en API 26 y aquí el mínimo es 25 (Fire OS 6).
     */
    private fun hideCustomView() {
        val view = customView ?: return
        (window.decorView as FrameLayout).removeView(view)
        webView.visibility = View.VISIBLE
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
    }

    /**
     * Reenvía al puente JS las teclas que Fire OS no entrega al DOM.
     *
     * Las flechas y el centro NO se tocan: Chromium ya las convierte en `keydown`
     * y de eso se encarga `SpatialNav` en la web. Solo se interceptan las de
     * transporte y el back.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event)

        when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                sendPlayPause()
                return true
            }
            KeyEvent.KEYCODE_MEDIA_REWIND -> {
                sendBridgeKey("rewind")
                return true
            }
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                sendBridgeKey("forward")
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                // Si hay un vídeo a pantalla completa, back sale de ahí primero.
                if (customView != null) {
                    hideCustomView()
                    return true
                }
                if (webView.canGoBack()) {
                    webView.goBack()
                    return true
                }
                // Sin historial: que back cierre la app es el comportamiento
                // esperado en Fire OS.
                return super.dispatchKeyEvent(event)
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /**
     * Play/pausa, por la vía que corresponda.
     *
     * Si la fuente activa es un `embed`, no hay `<video>` nuestro al que hablarle
     * y tampoco se puede inyectar teclado en un iframe de otro origen. Lo único
     * que atraviesa esa frontera es un toque REAL del sistema operativo sobre el
     * WebView: Chromium lo enruta al iframe y el player del proveedor lo recibe
     * como un click de usuario legítimo.
     *
     * Es frágil por naturaleza — depende de que ese player concreto alterne con
     * un click en el centro — pero no hay otra vía.
     */
    private fun sendPlayPause() {
        webView.evaluateJavascript(PLAYBACK_KIND_JS) { result ->
            if (result == "\"embed\"") tapCenter() else sendBridgeKey("play_pause")
        }
    }

    private fun sendBridgeKey(name: String) {
        webView.evaluateJavascript(
            "window.__mxTv && window.__mxTv.key(${quote(name)})",
            null,
        )
    }

    /** Toque sintético en el centro del WebView. Respaldo cuando no hay coordenadas. */
    private fun tapCenter() = tapAt((webView.width / 2).toFloat(), (webView.height / 2).toFloat())

    /**
     * Toque sintético en un punto concreto, en píxeles de vista.
     *
     * Se acota al área del WebView: unas coordenadas fuera de rango no tocarían
     * nada y, peor, podrían perderse en otra vista.
     */
    private fun tapAt(rawX: Float, rawY: Float) {
        if (webView.width == 0 || webView.height == 0) return
        val x = rawX.coerceIn(0f, (webView.width - 1).toFloat())
        val y = rawY.coerceIn(0f, (webView.height - 1).toFloat())
        val down = SystemClock.uptimeMillis()
        webView.dispatchTouchEvent(
            MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0),
        )
        webView.dispatchTouchEvent(
            MotionEvent.obtain(down, down + 60, MotionEvent.ACTION_UP, x, y, 0),
        )
    }

    /**
     * Fire OS avisa antes de matar el proceso. En un Stick de 1GB ese aviso llega
     * a menudo, y soltar la caché del WebView suele bastar para que no se cumpla
     * la amenaza — que es el cierre en seco que se veía al navegar el catálogo.
     */
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            webView.clearCache(false)
            webView.freeMemory()
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val APP_HOST = "mxndustv.xyz"
        const val BASE_URL = "https://www.$APP_HOST/tv"
        const val TV_USER_AGENT_TOKEN = "MexNodusTV/"

        /** Esquema propio del puente web → nativo. Ver src/lib/tv/bridge.ts. */
        const val HOST_SCHEME = "mxtv"
        const val APP_VERSION = "1.0"

        /** Devuelve "embed", "video" o null; lo fija el Player al montarse. */
        const val PLAYBACK_KIND_JS =
            "(window.__mxTv && window.__mxTv.playbackKind) || null"

        fun quote(s: String) = "\"" + s.replace("\"", "\\\"") + "\""
    }
}
