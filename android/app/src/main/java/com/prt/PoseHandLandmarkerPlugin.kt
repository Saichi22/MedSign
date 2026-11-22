package com.prt

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.os.SystemClock
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.nio.ByteBuffer

/**
 * FSL16 TCN landmark plugin (spec v2.0, section 4).  Replaces HandLandmarkerPlugin ("detectHands").
 *
 * Runs MediaPipe Pose Landmarker AND Hand Landmarker on the SAME frame, on an UPRIGHT, NOT-mirrored
 * image, and returns raw normalised landmarks. Slot assignment (left/right hand), the 59x3 layout and
 * all maths are done in TypeScript (utils/fslPreprocess.ts).
 *
 * JS call:  plugin.call(frame, { rotation: -1 | 0 | 90 | 180 | 270 })
 *           -1 (the "AUTO" badge) = DEFAULT_ROTATION below. Tap the rotation badge on screen to try others.
 * Returns:  { w, h, ts, pose: [x0,y0,...x16,y16] | [], hands: [{ lm: [x,y,z * 21], label }] }
 *           w,h = size of the upright image.
 *
 * Needs the camera to deliver RGBA frames: <Camera pixelFormat="rgb" /> (already set in the screen).
 */
class PoseHandLandmarkerPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

    companion object {
        // Clockwise degrees that make the camera image upright. Your earlier testing found 270 for the
        // front camera. If the debug line says SIDEWAYS/UPSIDE-DOWN, use the rotation badge to find the
        // right value, then change it here.
        const val DEFAULT_ROTATION = 270
    }

    private val hand: HandLandmarker
    private val pose: PoseLandmarker
    private var lastTs = 0L

    init {
        val ctx = proxy.context

        // Spec 4.1: numHands 2, all three hand confidences 0.4
        hand = HandLandmarker.createFromOptions(
            ctx,
            HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build())
                .setRunningMode(RunningMode.VIDEO)
                .setNumHands(2)
                .setMinHandDetectionConfidence(0.4f)
                .setMinHandPresenceConfidence(0.4f)
                .setMinTrackingConfidence(0.4f)
                .build()
        )

        // Spec 4.1: numPoses 1, other settings default
        pose = PoseLandmarker.createFromOptions(
            ctx,
            PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker_full.task").build())
                .setRunningMode(RunningMode.VIDEO)
                .setNumPoses(1)
                .build()
        )
    }

    /** RGBA_8888 camera image -> Bitmap (handles row padding). No CameraX classes needed. */
    private fun frameToBitmap(frame: Frame): Bitmap {
        val image = frame.image
        if (image.format != PixelFormat.RGBA_8888) {
            throw IllegalStateException(
                "detectLandmarks needs RGBA frames (Camera pixelFormat=\"rgb\"), got image format ${image.format}"
            )
        }
        val w = image.width
        val h = image.height
        val plane = image.planes[0]
        val rowStride = plane.rowStride
        val src: ByteBuffer = plane.buffer
        src.rewind()

        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        if (rowStride == w * 4) {
            bmp.copyPixelsFromBuffer(src)
        } else {
            // rows are padded: copy row by row into a tight buffer
            val tight = ByteBuffer.allocateDirect(w * 4 * h)
            val row = ByteArray(w * 4)
            for (y in 0 until h) {
                src.position(y * rowStride)
                src.get(row, 0, w * 4)
                tight.put(row)
            }
            tight.rewind()
            bmp.copyPixelsFromBuffer(tight)
        }
        return bmp
    }

    override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
        val bitmap = frameToBitmap(frame)

        // Rotate to UPRIGHT (clockwise degrees). Never mirror (spec 4.2).
        val requested = (arguments?.get("rotation") as? Number)?.toInt() ?: -1
        val rotation = if (requested >= 0) requested else DEFAULT_ROTATION
        val procOptions = ImageProcessingOptions.builder().setRotationDegrees(rotation).build()
        val swapped = rotation == 90 || rotation == 270
        val w = if (swapped) bitmap.height else bitmap.width
        val h = if (swapped) bitmap.width else bitmap.height

        val mpImage = BitmapImageBuilder(bitmap).build()

        // VIDEO mode needs strictly increasing timestamps
        var ts = SystemClock.uptimeMillis()
        if (ts <= lastTs) ts = lastTs + 1
        lastTs = ts

        // Same frame, same timestamp, both landmarkers
        val handRes = hand.detectForVideo(mpImage, procOptions, ts)
        val poseRes = pose.detectForVideo(mpImage, procOptions, ts)

        val poseOut = ArrayList<Double>()
        val poseLms = poseRes.landmarks()
        if (poseLms.isNotEmpty()) {
            val lms = poseLms[0]
            for (i in 0 until 17) {
                poseOut.add(lms[i].x().toDouble())
                poseOut.add(lms[i].y().toDouble())
            }
        }

        val handsOut = ArrayList<Any>()
        val handLms = handRes.landmarks()
        val handed = handRes.handedness()
        for (k in handLms.indices) {
            val lm = ArrayList<Double>(63)
            for (p in handLms[k]) {
                lm.add(p.x().toDouble()); lm.add(p.y().toDouble()); lm.add(p.z().toDouble())
            }
            val entry = HashMap<String, Any>()
            entry["lm"] = lm
            entry["label"] = if (k < handed.size && handed[k].isNotEmpty()) handed[k][0].categoryName() else ""
            handsOut.add(entry)
        }

        bitmap.recycle()

        val out = HashMap<String, Any>()
        out["w"] = w.toDouble()
        out["h"] = h.toDouble()
        out["ts"] = ts.toDouble()
        out["pose"] = poseOut
        out["hands"] = handsOut
        return out
    }
}