# MexNodus TV — app de Fire TV

Contenedor WebView que carga la superficie `/tv` de `www.mxndustv.xyz`.

No reimplementa catálogo ni reproductor. Aporta las tres cosas que un navegador
en la tele no puede dar:

1. **Bloqueo de popups** de los proveedores de embed (`WebChromeClient.onCreateWindow`).
   El `<iframe>` va sin `sandbox` a propósito porque varios proveedores lo
   detectan y se niegan a reproducir; el bloqueo se resuelve aquí, tal como
   anticipa el comentario de `src/lib/security/embed-shield.ts`.
2. **Reenvío de las teclas de reproducción** del mando, que en Fire OS no llegan
   al DOM como `keydown`. Van a `window.__mxTv.key(...)` (ver `src/lib/tv/bridge.ts`).
3. **Toque sintético sobre el iframe** para dar play cuando la fuente es un
   embed. Es la única forma de atravesar la frontera cross-origin.

## Compilar

Necesitas JDK 17 y el SDK de Android (API 34). Con Android Studio, abre la
carpeta `firetv/`. Desde consola:

```bash
cd firetv && ./gradlew assembleRelease
```

El APK sale en `firetv/app/build/outputs/apk/release/`. Va firmado con la clave
de depuración: suficiente para sideload, no para el Appstore (que de todas formas
está fuera de alcance).

> El wrapper de Gradle (`gradlew`, `gradle/wrapper/`) no está en el repo. Genéralo
> una vez con `gradle wrapper --gradle-version 8.7` o deja que Android Studio lo
> haga al abrir el proyecto.

## Instalar en el Fire TV

Activa **Ajustes → Mi Fire TV → Opciones de desarrollador → Depuración por ADB**,
mira la IP en **Ajustes → Red**, y luego:

```bash
adb connect 192.168.1.X:5555
```

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Para reinstalar sin cable más adelante: sube el APK a Supabase Storage y abre esa
URL con la app **Downloader**.

## Depurar

`chrome://inspect` en el Chrome del ordenador, con el Fire TV conectado por ADB,
lista el WebView y da consola y red completas.

**Ojo con una trampa ya documentada:** el player de EmbedMaster detecta las
devtools abiertas y se queda en blanco. Si ves el recuadro vacío, ciérralas y
prueba otra vez antes de buscar el fallo en el código.

## Qué toca cambiar si cambia el dominio

`APP_HOST` en `MainActivity.kt`. El `shouldOverrideUrlLoading` descarta cualquier
navegación fuera de ese host, así que un dominio nuevo sin actualizar esto deja
la app en blanco.
