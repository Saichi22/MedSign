package com.prt  // <- must match the package line at the top of your MainApplication.kt

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class SpeechRecognizerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var recognizer: SpeechRecognizer? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName() = "SpeechRecognizerModule"

    private fun emit(event: String, params: WritableMap? = null) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    private fun textFrom(bundle: Bundle?): String {
        val list = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        return list?.firstOrNull() ?: ""
    }

    // Required by NativeEventEmitter on the JS side
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactContext))
    }

    @ReactMethod
    fun start(language: String, promise: Promise) {
        mainHandler.post {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    promise.reject("UNAVAILABLE", "No speech recognition service on this device")
                    return@post
                }
                recognizer?.destroy()
                val r = SpeechRecognizer.createSpeechRecognizer(reactContext)
                r.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) { emit("onSpeechStart") }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() { emit("onSpeechEnd") }
                    override fun onError(error: Int) {
                        val m = Arguments.createMap()
                        m.putInt("code", error)
                        emit("onSpeechError", m)
                    }
                    override fun onResults(results: Bundle?) {
                        val m = Arguments.createMap()
                        m.putString("text", textFrom(results))
                        emit("onSpeechResult", m)
                    }
                    override fun onPartialResults(partialResults: Bundle?) {
                        val m = Arguments.createMap()
                        m.putString("text", textFrom(partialResults))
                        emit("onSpeechPartial", m)
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
                recognizer = r
                r.startListening(intent)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("START_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        mainHandler.post {
            try { recognizer?.stopListening() } catch (_: Exception) {}
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun destroy(promise: Promise) {
        mainHandler.post {
            try { recognizer?.destroy() } catch (_: Exception) {}
            recognizer = null
            promise.resolve(null)
        }
    }

    override fun invalidate() {
        mainHandler.post {
            try { recognizer?.destroy() } catch (_: Exception) {}
            recognizer = null
        }
        super.invalidate()
    }
}
