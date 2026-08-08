package expo.modules.logoanalysis

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.core.graphics.ColorUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.ArrayDeque
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Redraws a channel logo so it can sit on a tile of its own colour.
 *
 * The mark becomes white and the tile takes the channel's colour, which is what
 * makes a row recognisable before the name is read. Doing that naively destroys
 * logos, and the interesting part is which ones and why.
 *
 * Flattening every non-transparent pixel to white loses anything knocked out of
 * the mark: TSN's "1" is a hole punched in a red badge, so white-on-red becomes
 * white-on-white and the number disappears. Swapping the two tones instead fixes
 * that and breaks the opposite case, because C-SPAN's lettering *is* white and
 * swapping paints it the tile colour.
 *
 * Neither can be decided per logo, because TSN needs both answers at once: its
 * "1" is a hole and must flip, while its arrow stands free on transparency and
 * must not. They are the same colour, so nothing about the colours separates
 * them. Only where they sit does.
 *
 * So the decision is geometric. Flood filling inwards from the border, without
 * crossing the coloured mark, reaches every light pixel the outside can see;
 * those belong to the mark and are left alone. Light pixels it cannot reach are
 * enclosed, and take the tile colour so a hole still reads as a hole.
 *
 * Logos of several hues are excluded before any of this. No two-tone treatment
 * survives the NBC peacock, whose colours are what identify it.
 */
class LogoAnalysisModule : Module() {
  private companion object {
    /** Crisp on a 66x44 tile at 3x, and still cheap to walk. */
    const val TARGET = 256

    const val CLEAR = 0
    const val MARK = 1
    const val LIGHT = 2

    /** Below this the logo fills its own canvas: already a tile, nothing to do. */
    const val OPAQUE_BELOW = 0.12

    /** Above this the mark uses more than one hue and has to be left as drawn. */
    const val MULTI_HUE_ABOVE = 0.25

    /** A mark with almost no colour in it has no colour to put behind it. */
    const val NEEDS_COLOR_ABOVE = 0.04
  }

  override fun definition() = ModuleDefinition {
    Name("LogoAnalysis")

    AsyncFunction("prepare") { url: String ->
      val bitmap = decode(url)
      if (bitmap == null) plain() else prepare(url, bitmap)
    }
  }

  private fun plain(): Map<String, Any?> = mapOf("kind" to "plain")

  private fun decode(url: String): Bitmap? {
    val bytes = URL(url).openStream().use { it.readBytes() }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)

    val largest = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (largest / (sample * 2) >= TARGET) sample *= 2

    return BitmapFactory.decodeByteArray(
      bytes,
      0,
      bytes.size,
      BitmapFactory.Options().apply { inSampleSize = sample },
    )
  }

  private fun prepare(url: String, bitmap: Bitmap): Map<String, Any?> {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    val kind = IntArray(pixels.size)
    var transparent = 0
    var opaque = 0

    // Hues are angles and average as vectors. Summed as numbers, red at 0.02 and
    // red at 0.98 would average to cyan rather than back to red.
    var hueX = 0.0
    var hueY = 0.0
    var hueCount = 0
    var bestSaturation = 0f
    var accent = 0

    val hsl = FloatArray(3)

    for (i in pixels.indices) {
      val pixel = pixels[i]
      if (Color.alpha(pixel) < 128) {
        transparent++
        kind[i] = CLEAR
        continue
      }
      opaque++

      ColorUtils.colorToHSL(pixel, hsl)
      val saturation = hsl[1]
      val lightness = hsl[2]

      val colored = saturation > 0.25f && lightness > 0.12f && lightness < 0.95f
      kind[i] = if (colored || lightness < 0.5f) MARK else LIGHT

      if (colored) {
        val radians = Math.toRadians(hsl[0].toDouble())
        hueX += cos(radians)
        hueY += sin(radians)
        hueCount++
        if (saturation > bestSaturation) {
          bestSaturation = saturation
          accent = pixel
        }
      }
    }

    val total = pixels.size.toDouble()
    val transparentFraction = transparent / total
    val hueSpread =
      if (hueCount < 20) 0.0 else 1.0 - hypot(hueX / hueCount, hueY / hueCount)
    val colorfulFraction = if (opaque == 0) 0.0 else hueCount.toDouble() / opaque

    if (
      transparentFraction < OPAQUE_BELOW ||
      hueSpread > MULTI_HUE_ABOVE ||
      colorfulFraction < NEEDS_COLOR_ABOVE ||
      hueCount == 0
    ) {
      return plain()
    }

    val outside = floodFromBorder(kind, width, height)

    for (i in pixels.indices) {
      if (kind[i] == MARK) {
        pixels[i] = Color.argb(Color.alpha(pixels[i]), 255, 255, 255)
      } else if (kind[i] == LIGHT && !outside[i]) {
        pixels[i] =
          Color.argb(
            Color.alpha(pixels[i]),
            Color.red(accent),
            Color.green(accent),
            Color.blue(accent),
          )
      }
      // Light and reachable from outside: part of the mark, left as it is.
    }

    val redrawn = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    redrawn.setPixels(pixels, 0, width, 0, 0, width, height)

    val file = File(cacheDir(), "logo-" + digest(url) + ".png")
    file.outputStream().use { redrawn.compress(Bitmap.CompressFormat.PNG, 100, it) }

    return mapOf(
      "kind" to "prepared",
      "uri" to "file://" + file.absolutePath,
      "color" to hex(accent),
    )
  }

  /**
   * Every pixel the outside can reach without crossing the mark.
   *
   * Four-way rather than eight-way on purpose: a one-pixel diagonal gap, which
   * anti-aliasing produces constantly, would otherwise let the fill leak into a
   * hole and leave it uncoloured.
   */
  private fun floodFromBorder(kind: IntArray, width: Int, height: Int): BooleanArray {
    val seen = BooleanArray(kind.size)
    val queue = ArrayDeque<Int>()

    fun push(x: Int, y: Int) {
      val i = y * width + x
      if (!seen[i] && kind[i] != MARK) {
        seen[i] = true
        queue.add(i)
      }
    }

    for (x in 0 until width) {
      push(x, 0)
      push(x, height - 1)
    }
    for (y in 0 until height) {
      push(0, y)
      push(width - 1, y)
    }

    while (queue.isNotEmpty()) {
      val i = queue.poll()
      val x = i % width
      val y = i / width
      if (x > 0) push(x - 1, y)
      if (x < width - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < height - 1) push(x, y + 1)
    }

    return seen
  }

  private fun cacheDir(): File {
    val dir = File(appContext.cacheDirectory, "logo-analysis")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun digest(value: String) =
    MessageDigest.getInstance("MD5")
      .digest(value.toByteArray())
      .joinToString("") { "%02x".format(it) }

  private fun hex(color: Int) =
    String.format("#%02x%02x%02x", Color.red(color), Color.green(color), Color.blue(color))
}
