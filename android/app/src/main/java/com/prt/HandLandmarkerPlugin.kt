package com.prt

import android.util.Log
import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

class HandLandmarkerPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) :
  FrameProcessorPlugin() {

  private val landmarker: HandLandmarker
  private var lastTimestampMs = 0L
  private var logged = false
  private val ROTATION_OVERRIDE: Int? = null   // try 0, 90, 180, 270 here if needed

  init {
    val base = BaseOptions.builder()
      .setModelAssetPath("hand_landmarker.task")
      .setDelegate(Delegate.CPU)
      .build()

    val opts = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(base)
      .setRunningMode(RunningMode.VIDEO)
      .setNumHands(2)
      .setMinHandDetectionConfidence(0.5f)
      .setMinHandPresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .build()

    landmarker = HandLandmarker.createFromOptions(proxy.context, opts)
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    return try {
      val mpImage = MediaImageBuilder(frame.image).build()

      var ts = frame.timestamp / 1_000_000L
      if (ts <= lastTimestampMs) ts = lastTimestampMs + 1
      lastTimestampMs = ts

      val rotation = ROTATION_OVERRIDE ?: if (frame.width > frame.height) {
        if (frame.isMirrored) 270 else 90
      } else 0

      if (!logged) {
        logged = true
        Log.e("HandLM", "w=${frame.width} h=${frame.height} mirrored=${frame.isMirrored} " +
          "imgFormat=${frame.image.format} rotation=$rotation")
      }

      val procOpts = ImageProcessingOptions.builder()
        .setRotationDegrees(rotation)
        .build()

      val result = landmarker.detectForVideo(mpImage, procOpts, ts)

      val hands = ArrayList<Any>()
      for (hand in result.landmarks()) {
        val flat = ArrayList<Double>(63)
        for (lm in hand) {
          flat.add(lm.x().toDouble())
          flat.add(lm.y().toDouble())
          flat.add(lm.z().toDouble())
        }
        hands.add(flat)
      }
      Log.e("HandLM", "hands=${hands.size}")
      hands
    } catch (e: Exception) {
      Log.e("HandLM", "detect failed", e)
      null
    }
  }
}