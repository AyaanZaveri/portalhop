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
    /**
     * The longest edge the analysed copy is kept at.
     *
     * 256 was sized for drawing the canvas into a 66x44 tile at 3x, and that
     * stopped being the whole story once the tile started sizing the artwork
     * instead. A logo whose mark is 40% of its canvas is now drawn with the
     * canvas well outside the tile, so the pixels that matter are a fraction of
     * what is stored: Mississauga needs a canvas around 280px tall on a 3.5x
     * screen to put 112px of mark on the tile, and at 256 it was being
     * upscaled. Four times the pixels, still around a megabyte to walk.
     */
    const val TARGET = 512

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

    /**
     * How light the tile is allowed to get.
     *
     * The mark is drawn white on it, so a pale accent leaves white on white.
     * Star Gold's is a light pink and its tile came out barely tinted, with the
     * logo invisible against it. Darkening keeps the hue — it still reads as
     * pink — while giving the white something to sit on.
     */
    const val TILE_LIGHTNESS_MAX = 0.42f

    /**
     * How much of an opaque logo's outer ring must be one colour before that
     * colour is carried onto the tile.
     *
     * Artwork that fills its own canvas is a finished tile, and when its edge is
     * a flat colour the surrounding tile can simply continue it, so the two read
     * as one shape rather than a square sitting in a box. Measured, Mississauga
     * scores 1.00 and Sky Sports 0.98, while Game Show Network scores 0.00 and
     * SAB 0.01 — there is nothing in between to get wrong.
     */
    const val BORDER_UNIFORM_ABOVE = 0.90

    /** How close two colours must be to count as the same along that ring. */
    const val BORDER_TOLERANCE = 28

    /**
     * How much of a colourless mark must be dark before it is turned white.
     *
     * A black wordmark on the near-black tile is invisible, which is the one
     * case where leaving a logo alone is worse than touching it. ABC's mark
     * measures 0.70 dark; CP24, HBO and AMC are drawn white already and measure
     * 0.00.
     */
    const val DARK_INK_ABOVE = 0.35

    /** Below this a pixel counts as dark ink rather than light. */
    const val DARK_INK_LIGHTNESS = 0.45f

    /**
     * The tile a logo sits on when it contributes no colour of its own.
     *
     * Kept in step with TILE_BASE in components/channel-logo.tsx. It is used to
     * fill the holes in a whitened mark, and those holes have to match the tile
     * behind them or they read as grey blocks rather than as cutouts.
     */
    const val TILE_BASE = 0xFF18181B.toInt()
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
    // Timeouts, because several of these hosts are bare IPs over plain HTTP and
    // one that stops answering would otherwise hold the request open
    // indefinitely — blocking the logo behind it rather than failing and moving
    // on.
    val connection =
      URL(url).openConnection().apply {
        connectTimeout = 8_000
        readTimeout = 8_000
      }
    val bytes = connection.getInputStream().use { it.readBytes() }

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

    // Artwork that fills its own canvas is already a tile. Nothing is redrawn,
    // but where its edge is a flat colour the tile can continue it, so the two
    // read as one shape instead of a square sitting inside a box.
    if (transparentFraction < OPAQUE_BELOW) {
      val border = uniformBorder(pixels, width, height)
      // Measured against the border colour rather than transparency: filled
      // artwork has none, and its margin is that flat colour.
      return if (border == null) plain() + frame(pixels, width, height, null)
      else mapOf("kind" to "prepared", "uri" to url, "color" to hex(border)) +
        frame(pixels, width, height, border)
    }

    if (hueSpread > MULTI_HUE_ABOVE) return plain() + frame(pixels, width, height, null)

    // A mark with no colour in it has no colour to put behind it — but if the
    // ink is dark it is invisible against the near-black tile, and that is the
    // one case where leaving a logo alone is worse than touching it. Turning it
    // white costs nothing, since there is no colour to lose.
    //
    // Which is the same redraw as below with a different tile, so it is the same
    // code: the mark goes white and its enclosed holes take the tile's colour.
    // Whitening the whole mark and stopping there is what loses ABC's lettering,
    // exactly as it once lost TSN's "1" — the letters are white already, and a
    // white disc drawn over them leaves nothing but the disc.
    val tile: Int
    if (colorfulFraction < NEEDS_COLOR_ABOVE || hueCount == 0) {
      var dark = 0
      for (i in pixels.indices) {
        if (kind[i] == CLEAR) continue
        ColorUtils.colorToHSL(pixels[i], hsl)
        if (hsl[2] < DARK_INK_LIGHTNESS) dark++
      }

      if (opaque == 0 || dark.toDouble() / opaque < DARK_INK_ABOVE) {
        return plain() + frame(pixels, width, height, null)
      }
      tile = TILE_BASE
    } else {
      // Darkened before it is used anywhere: the holes are painted with it and
      // the tile is set to it, and both need the white mark to read against
      // them.
      tile = darken(accent)
    }

    recolorEnclosed(pixels, kind, width, height, tile)

    for (i in pixels.indices) {
      if (kind[i] == MARK) {
        pixels[i] = Color.argb(Color.alpha(pixels[i]), 255, 255, 255)
      }
    }

    // Taken before the redraw only for clarity; the redraw changes colours and
    // never alpha, so the artwork occupies the same rectangle either way.
    val shape = frame(pixels, width, height, null)
    val uri = write(url, pixels, width, height)
    // A colourless mark asks for no tile of its own, and saying so lets the tile
    // stay whatever the app's base happens to be under either theme.
    return shape +
      if (tile == TILE_BASE) mapOf("kind" to "prepared", "uri" to uri)
      else mapOf("kind" to "prepared", "uri" to uri, "color" to hex(tile))
  }

  /**
   * Where the artwork sits inside its canvas, as fractions of it.
   *
   * A logo file's own margin is arbitrary. Mississauga's is 30% flat blue above
   * and below the mark, so fitting the canvas into the tile hands that margin
   * straight through and stacks it on top of the tile's own padding -- which is
   * why that logo came out a postage stamp while CP24, drawn edge to edge in its
   * file, came out enormous. Reporting the rectangle lets the tile size the
   * artwork rather than the canvas around it.
   *
   * The background to ignore is transparency for most logos and the flat border
   * colour for filled artwork, which has no transparency to ignore.
   */
  private fun frame(
    pixels: IntArray,
    width: Int,
    height: Int,
    background: Int?,
  ): Map<String, Any?> {
    var left = width
    var top = height
    var right = -1
    var bottom = -1

    for (y in 0 until height) {
      for (x in 0 until width) {
        val pixel = pixels[y * width + x]
        val ink =
          if (background == null) {
            Color.alpha(pixel) >= 128
          } else {
            Color.alpha(pixel) > 128 &&
              maxOf(
                Math.abs(Color.red(pixel) - Color.red(background)),
                Math.abs(Color.green(pixel) - Color.green(background)),
                Math.abs(Color.blue(pixel) - Color.blue(background)),
              ) >= BORDER_TOLERANCE
          }
        if (!ink) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }

    val aspect = mapOf("aspect" to width.toDouble() / height)
    // Nothing found means nothing to frame -- a fully transparent image, or
    // filled artwork that is a single flat colour edge to edge.
    if (right < left || bottom < top) return aspect

    return aspect +
      mapOf(
        "content" to
          mapOf(
            "x" to left.toDouble() / width,
            "y" to top.toDouble() / height,
            "width" to (right - left + 1).toDouble() / width,
            "height" to (bottom - top + 1).toDouble() / height,
          )
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

  private fun write(url: String, pixels: IntArray, width: Int, height: Int): String {
    val redrawn = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    redrawn.setPixels(pixels, 0, width, 0, 0, width, height)
    val file = File(cacheDir(), "logo-" + digest(url) + ".png")
    file.outputStream().use { redrawn.compress(Bitmap.CompressFormat.PNG, 100, it) }
    return "file://" + file.absolutePath
  }

  /**
   * The colour of the outer ring, when the ring is all one colour.
   *
   * Two pixels deep rather than one: the outermost row of a scaled bitmap is
   * often a blend with whatever was outside it, and sampling only that would
   * report an edge as varied when the artwork behind it is flat.
   */
  private fun uniformBorder(pixels: IntArray, width: Int, height: Int): Int? {
    val ring = ArrayList<Int>()
    for (x in 0 until width) {
      for (y in intArrayOf(0, 1, height - 2, height - 1)) {
        if (y in 0 until height) {
          val p = pixels[y * width + x]
          if (Color.alpha(p) > 200) ring.add(p)
        }
      }
    }
    for (y in 0 until height) {
      for (x in intArrayOf(0, 1, width - 2, width - 1)) {
        if (x in 0 until width) {
          val p = pixels[y * width + x]
          if (Color.alpha(p) > 200) ring.add(p)
        }
      }
    }
    if (ring.isEmpty()) return null

    var r = 0L
    var g = 0L
    var b = 0L
    for (p in ring) {
      r += Color.red(p)
      g += Color.green(p)
      b += Color.blue(p)
    }
    val average = Color.rgb((r / ring.size).toInt(), (g / ring.size).toInt(), (b / ring.size).toInt())

    var near = 0
    for (p in ring) {
      val delta =
        maxOf(
          Math.abs(Color.red(p) - Color.red(average)),
          Math.abs(Color.green(p) - Color.green(average)),
          Math.abs(Color.blue(p) - Color.blue(average)),
        )
      if (delta < BORDER_TOLERANCE) near++
    }

    return if (near.toDouble() / ring.size >= BORDER_UNIFORM_ABOVE) average else null
  }

  /** Pulls a colour down to the tile ceiling, keeping its hue and saturation. */
  private fun darken(color: Int): Int {
    val hsl = FloatArray(3)
    ColorUtils.colorToHSL(color, hsl)
    if (hsl[2] <= TILE_LIGHTNESS_MAX) return color
    hsl[2] = TILE_LIGHTNESS_MAX
    return ColorUtils.HSLToColor(hsl)
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
