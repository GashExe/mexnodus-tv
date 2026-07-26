plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "xyz.mxndustv.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "xyz.mxndustv.tv"
        // 25 = Android 7.1, que es Fire OS 6 (Fire TV Stick 4K de 2018). Cubre
        // los tres modelos objetivo; subirlo a 28 dejaría fuera los más viejos.
        minSdk = 25
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sin firma de release configurada: se instala por sideload con la
            // firma de depuración. Ver firetv/README.md.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
