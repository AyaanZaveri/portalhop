package expo.modules.logoanalysis

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.core.graphics.ColorUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Describes a channel logo well enough to decide how to present it.
 *
 * Three kinds of logo want three different treatments, and telling them apart
 * is the whole problem:
 *
 *   a single-hue mark on transparency — TSN, CNN, Food Network — can be tinted
 *   flat white and set on its own colour, which is the treatment that makes a
 *   channel unmistakable
 *
 *   a mark of several hues — the NBC peacock — must be left exactly as drawn,
 *   because flattening it destroys the thing that identifies it
 *
 *   artwork that already fills its own canvas — Game Show Network, Mississauga
 *   — is a finished tile and wants nothing done to it at all
 *
 * Two measurements separate them: how much of the image is transparent, and how
 * far the hues of the opaque pixels spread. Measured on real logos the gap is
 * not close — single-hue marks score 0.00 spread, the peacock 0.88.
 *
 * Native rather than JavaScript because reading pixels needs a real decoder.
 * The image is fetched again rather than borrowed from expo-image's Glide
 * cache: sharing that cache means a compile-time dependency on another module's
 * internals, and the second fetch happens once per logo in the app's lifetime
 * because the verdict is stored.
 */
class LogoAnalysisModule : Module() {
  private companion object {
    const val TARGET = 64
  }

  override fun definition() = ModuleDefinition {
    Name("LogoAnalysis")

    AsyncFunction("analyze") { url: String ->
      decode(url)?.let { analyze(it) }
    }
  }

  /**
   * Decodes at roughly 64 pixels across.
   *
   * Nothing measured here needs detail: a thumbnail carries the same hue
   * distribution as the original at a hundredth of the pixels, and decoding the
   * full image only to walk it would be the slow part of this.
   */
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

  private fun analyze(bitmap: Bitmap): Map<String, Any?> {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    var transparent = 0
    var opaque = 0

    // Hues are angles, so they average as vectors. Summing them as numbers puts
    // the mean of red at 0.02 and red at 0.98 in the middle of the wheel — cyan
    // — rather than back at red.
    var hueX = 0.0
    var hueY = 0.0
    var hueCount = 0

    // Weighted towards more saturated pixels, so a wash of near-grey does not
    // drag the answer around.
    var bestSaturation = 0f
    var bestColor = 0

    val hsl = FloatArray(3)

    for (pixel in pixels) {
      val alpha = Color.alpha(pixel)
      if (alpha < 32) {
        transparent++
        continue
      }
      if (alpha < 200) continue
      opaque++

      ColorUtils.colorToHSL(pixel, hsl)
      val (hue, saturation, lightness) = Triple(hsl[0], hsl[1], hsl[2])

      // Only pixels with a colour worth calling a colour. Black, white and grey
      // have a hue of sorts and it means nothing.
      if (saturation > 0.25f && lightness > 0.12f && lightness < 0.95f) {
        val radians = Math.toRadians(hue.toDouble())
        hueX += cos(radians)
        hueY += sin(radians)
        hueCount++

        if (saturation > bestSaturation) {
          bestSaturation = saturation
          bestColor = pixel
        }
      }
    }

    val total = pixels.size.toDouble()

    // 1 minus the length of the mean vector: zero when every hue agrees, one
    // when they are spread evenly around the wheel. Too few coloured pixels to
    // be meaningful counts as agreement, since there is nothing to disagree.
    val spread =
      if (hueCount < 20) 0.0 else 1.0 - hypot(hueX / hueCount, hueY / hueCount)

    return mapOf(
      "transparentFraction" to transparent / total,
      "opaqueFraction" to opaque / total,
      "hueSpread" to spread,
      "colorfulFraction" to if (opaque == 0) 0.0 else hueCount.toDouble() / opaque,
      "accent" to if (hueCount == 0) null else hex(bestColor),
      // The most common opaque colour, which for artwork that fills its canvas
      // is the background it is sitting on.
      "background" to hex(dominantOpaque(pixels)),
    )
  }

  /** The most frequent opaque colour, bucketed so near-identical shades count together. */
  private fun dominantOpaque(pixels: IntArray): Int {
    val counts = HashMap<Int, Int>()
    for (pixel in pixels) {
      if (Color.alpha(pixel) < 200) continue
      val bucket =
        Color.rgb(Color.red(pixel) and 0xF0, Color.green(pixel) and 0xF0, Color.blue(pixel) and 0xF0)
      counts[bucket] = (counts[bucket] ?: 0) + 1
    }
    return counts.maxByOrNull { it.value }?.key ?: Color.BLACK
  }

  private fun hex(color: Int) =
    String.format("#%02x%02x%02x", Color.red(color), Color.green(color), Color.blue(color))
}
