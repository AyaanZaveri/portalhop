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
 * So the decision is geometric, and it is made per region rather than per logo.
 * Each connected run of light pixels is measured for how much of its border
 * touches the mark. A knocked-out glyph is almost entirely ringed by it; a mark
 * standing on transparency is barely touched by it at all.
 *
 * Reachability from the border was the obvious test and is too brittle. Food
 * Network's "f" and "d" graze the edge of the circle they sit in, and CNN's coil
 * runs out to meet its own outline, so a single pixel of contact made the fill
 * call them free-standing and leave them white on a white mark. Surroundedness
 * barely notices that contact: those regions still measure 0.96 and 0.99, while
 * TSN's arrow and every letter of C-SPAN measure 0.00.
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

    /**
     * How much of a light region's border must touch the mark for it to count
     * as knocked out of it.
     *
     * Measured, the two cases do not overlap at all: enclosed regions score 0.96
     * to 1.00 and free-standing ones score 0.00, so anywhere in between does.
     */
    const val SURROUNDED_ABOVE = 0.55
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

    recolorEnclosed(pixels, kind, width, height, accent)

    for (i in pixels.indices) {
      if (kind[i] == MARK) {
        pixels[i] = Color.argb(Color.alpha(pixels[i]), 255, 255, 255)
      }
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
   * Paints every light region that is mostly ringed by the mark.
   *
   * Four-way neighbours throughout: a one-pixel diagonal gap, which
   * anti-aliasing produces constantly, would otherwise join a hole to the
   * outside and halve its measured surroundedness.
   */
  private fun recolorEnclosed(
    pixels: IntArray,
    kind: IntArray,
    width: Int,
    height: Int,
    accent: Int,
  ) {
    val seen = BooleanArray(kind.size)
    val queue = ArrayDeque<Int>()
    val region = ArrayList<Int>()

    for (start in kind.indices) {
      if (kind[start] != LIGHT || seen[start]) continue

      region.clear()
      queue.add(start)
      seen[start] = true

      var touchingMark = 0
      var touchingRest = 0

      while (queue.isNotEmpty()) {
        val i = queue.poll()
        region.add(i)
        val x = i % width
        val y = i / width

        for (n in 0 until 4) {
          val nx = x + if (n == 0) -1 else if (n == 1) 1 else 0
          val ny = y + if (n == 2) -1 else if (n == 3) 1 else 0

          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            // The image edge counts as the outside, so a region running off it
            // is not enclosed by anything.
            touchingRest++
            continue
          }

          val j = ny * width + nx
          when {
            kind[j] == LIGHT ->
              if (!seen[j]) {
                seen[j] = true
                queue.add(j)
              }
            kind[j] == MARK -> touchingMark++
            else -> touchingRest++
          }
        }
      }

      val border = touchingMark + touchingRest
      if (border == 0) continue
      if (touchingMark.toDouble() / border < SURROUNDED_ABOVE) continue

      for (i in region) {
        pixels[i] =
          Color.argb(
            Color.alpha(pixels[i]),
            Color.red(accent),
            Color.green(accent),
            Color.blue(accent),
          )
      }
    }
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
