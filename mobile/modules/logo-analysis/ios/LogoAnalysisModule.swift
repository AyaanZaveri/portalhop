import CoreGraphics
import CryptoKit
import ExpoModulesCore
import Foundation
import ImageIO
import UniformTypeIdentifiers

/**
 * The iOS half of the logo pass. The Kotlin under ../android is the other half.
 *
 * Both reach the same verdicts from the same measurements, and the thresholds
 * below are the same numbers in the same order as the Kotlin's — the reasoning
 * for each lives there, next to the logos that produced it, rather than being
 * copied and left to drift. What is worth saying here is only what iOS does
 * differently to arrive at the same place:
 *
 *  - HSL is written out by hand. Android has ColorUtils.colorToHSL; UIColor
 *    offers HSB, which is a different model — a saturated dark red is 1.0
 *    saturated in HSB and 0.5 in HSL, so borrowing it would move every
 *    threshold. This is Android's formula, digit for digit.
 *  - Pixels come back premultiplied, because a CGBitmapContext has no
 *    non-premultiplied 8-bit RGBA form, and are divided back out. Without that,
 *    a part-transparent pixel reads darker than the file stores it, and the
 *    lightness tests drift with it.
 *  - Downsampling is by longest edge rather than by a power-of-two sample size.
 *    Every measurement here is a ratio, so the exact scale does not change a
 *    verdict; it only means iOS may analyse a slightly larger copy.
 */
public final class LogoAnalysisModule: Module {
  /// Matches TARGET in the Kotlin, and the same reasoning applies.
  private static let target = 512

  private static let clear = 0
  private static let mark = 1
  private static let light = 2

  private static let opaqueBelow = 0.12
  private static let multiHueAbove = 0.25
  private static let needsColorAbove = 0.04
  private static let surroundedAbove = 0.55
  private static let whiteContrastMin = 3.0
  private static let borderMajorityAbove = 0.60
  private static let borderTolerance = 28
  private static let borderBucket = 24
  private static let wordmarkShareAbove = 0.15
  private static let wordmarkDarkAbove = 0.40
  private static let darkInkAbove = 0.35
  private static let darkInkLightness = 0.45

  private static let tilePaper: UInt32 = 0xFF_FA_FA_FA
  private static let tileBase: UInt32 = 0xFF_18_1A_14

  public func definition() -> ModuleDefinition {
    Name("LogoAnalysis")

    AsyncFunction("prepare") { (url: String) -> [String: Any] in
      guard let image = Self.decode(url) else { return Self.plain() }
      return Self.prepare(url: url, image: image)
    }
  }

  // MARK: - Colour channels

  private static func alpha(_ c: UInt32) -> Int { Int((c >> 24) & 0xFF) }
  private static func red(_ c: UInt32) -> Int { Int((c >> 16) & 0xFF) }
  private static func green(_ c: UInt32) -> Int { Int((c >> 8) & 0xFF) }
  private static func blue(_ c: UInt32) -> Int { Int(c & 0xFF) }

  private static func argb(_ a: Int, _ r: Int, _ g: Int, _ b: Int) -> UInt32 {
    (UInt32(a) << 24) | (UInt32(r) << 16) | (UInt32(g) << 8) | UInt32(b)
  }

  private static func hex(_ c: UInt32) -> String {
    String(format: "#%02x%02x%02x", red(c), green(c), blue(c))
  }

  /// Android's ColorUtils.colorToHSL, with hue in degrees. See the note above.
  private static func toHSL(_ c: UInt32) -> (h: Double, s: Double, l: Double) {
    let r = Double(red(c)) / 255, g = Double(green(c)) / 255, b = Double(blue(c)) / 255
    let mx = max(r, max(g, b)), mn = min(r, min(g, b))
    let delta = mx - mn
    let l = (mx + mn) / 2

    var h = 0.0
    var s = 0.0
    if delta != 0 {
      if mx == r {
        h = ((g - b) / delta).truncatingRemainder(dividingBy: 6)
      } else if mx == g {
        h = (b - r) / delta + 2
      } else {
        h = (r - g) / delta + 4
      }
      // Safe from a divide by zero: delta is non-zero only when 0 < l < 1.
      s = delta / (1 - abs(2 * l - 1))
    }

    h = (h * 60).truncatingRemainder(dividingBy: 360)
    if h < 0 { h += 360 }
    return (h, s, l)
  }

  private static func fromHSL(h: Double, s: Double, l: Double) -> UInt32 {
    let c = (1 - abs(2 * l - 1)) * s
    let m = l - c / 2
    let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))

    var r = 0.0, g = 0.0, b = 0.0
    switch Int(h / 60) % 6 {
    case 0: (r, g, b) = (c, x, 0)
    case 1: (r, g, b) = (x, c, 0)
    case 2: (r, g, b) = (0, c, x)
    case 3: (r, g, b) = (0, x, c)
    case 4: (r, g, b) = (x, 0, c)
    default: (r, g, b) = (c, 0, x)
    }

    func byte(_ v: Double) -> Int { min(255, max(0, Int((v + m) * 255 + 0.5))) }
    return argb(255, byte(r), byte(g), byte(b))
  }

  /// WCAG relative luminance: linearised channels, weighted for the eye.
  private static func relativeLuminance(_ color: UInt32) -> Double {
    func channel(_ value: Int) -> Double {
      let c = Double(value) / 255
      return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(red(color))
      + 0.7152 * channel(green(color))
      + 0.0722 * channel(blue(color))
  }

  /// How far white stands off a colour. White's own luminance is 1.0.
  private static func whiteContrast(_ color: UInt32) -> Double {
    1.05 / (relativeLuminance(color) + 0.05)
  }

  /// The lightest a colour may be while a white mark still reads on it.
  private static func darken(_ color: UInt32) -> UInt32 {
    if whiteContrast(color) >= whiteContrastMin { return color }

    let hsl = toHSL(color)
    var low = 0.0
    var high = hsl.l
    // Halved rather than solved: luminance runs through a gamma curve and a
    // weighted sum, so there is no lightness to rearrange for.
    for _ in 0..<24 {
      let middle = (low + high) / 2
      if whiteContrast(fromHSL(h: hsl.h, s: hsl.s, l: middle)) >= whiteContrastMin {
        low = middle
      } else {
        high = middle
      }
    }

    return fromHSL(h: hsl.h, s: hsl.s, l: low)
  }

  // MARK: - Loading

  private static func plain() -> [String: Any] { ["kind": "plain"] }

  private struct Raster {
    var pixels: [UInt32]
    let width: Int
    let height: Int
  }

  private static func decode(_ urlString: String) -> Raster? {
    guard let url = URL(string: urlString) else { return nil }

    // Timeouts, because several of these hosts are bare IPs over plain HTTP and
    // one that stops answering would otherwise hold the request open
    // indefinitely, blocking the logo behind it rather than failing and moving
    // on. The semaphore has a longer deadline than the request so the request's
    // own timeout is what reports the failure.
    var request = URLRequest(url: url)
    request.timeoutInterval = 8

    var payload: Data?
    let waiter = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: request) { data, _, _ in
      payload = data
      waiter.signal()
    }.resume()
    _ = waiter.wait(timeout: .now() + 16)

    guard let bytes = payload,
      let source = CGImageSourceCreateWithData(bytes as CFData, nil)
    else { return nil }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: target,
    ]
    guard
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return nil }

    return unpack(image)
  }

  private static func unpack(_ image: CGImage) -> Raster? {
    let width = image.width
    let height = image.height
    guard width > 0, height > 0 else { return nil }

    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    let space = CGColorSpaceCreateDeviceRGB()
    var drew = false
    bytes.withUnsafeMutableBytes { raw in
      guard
        let context = CGContext(
          data: raw.baseAddress,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: width * 4,
          space: space,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
      else { return }
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      drew = true
    }
    guard drew else { return nil }

    var pixels = [UInt32](repeating: 0, count: width * height)
    for i in 0..<(width * height) {
      let a = Int(bytes[i * 4 + 3])
      if a == 0 { continue }
      // Divided back out, so the colours are the ones the file stores rather
      // than the ones the compositor would draw. See the note at the top.
      let scale = 255.0 / Double(a)
      func channel(_ offset: Int) -> Int {
        min(255, Int(Double(bytes[i * 4 + offset]) * scale + 0.5))
      }
      pixels[i] = argb(a, channel(0), channel(1), channel(2))
    }
    return Raster(pixels: pixels, width: width, height: height)
  }

  // MARK: - The pass

  private static func prepare(url: String, image: Raster) -> [String: Any] {
    var pixels = image.pixels
    let width = image.width
    let height = image.height

    var kind = [Int](repeating: clear, count: pixels.count)
    var transparent = 0
    var opaque = 0

    // Hues are angles and average as vectors. Summed as numbers, red at 0.02 and
    // red at 0.98 would average to cyan rather than back to red.
    var hueX = 0.0
    var hueY = 0.0
    var hueCount = 0
    var bestSaturation = 0.0
    var accent: UInt32 = 0

    // Uncoloured ink, split by lightness. This is the wordmark next to a
    // coloured mark, and whether it is dark decides which way up the tile goes.
    var achromatic = 0
    var achromaticDark = 0

    for i in 0..<pixels.count {
      let pixel = pixels[i]
      if alpha(pixel) < 128 {
        transparent += 1
        kind[i] = clear
        continue
      }
      opaque += 1

      let hsl = toHSL(pixel)
      let colored = hsl.s > 0.25 && hsl.l > 0.12 && hsl.l < 0.95
      kind[i] = (colored || hsl.l < 0.5) ? mark : light

      if colored {
        let radians = hsl.h * Double.pi / 180
        hueX += cos(radians)
        hueY += sin(radians)
        hueCount += 1
        if hsl.s > bestSaturation {
          bestSaturation = hsl.s
          accent = pixel
        }
      } else {
        achromatic += 1
        if hsl.l < darkInkLightness { achromaticDark += 1 }
      }
    }

    let total = Double(pixels.count)
    let transparentFraction = Double(transparent) / total
    var hueSpread = 0.0
    if hueCount >= 20 {
      let dx = hueX / Double(hueCount)
      let dy = hueY / Double(hueCount)
      hueSpread = 1.0 - (dx * dx + dy * dy).squareRoot()
    }
    let colorfulFraction = opaque == 0 ? 0.0 : Double(hueCount) / Double(opaque)

    // Artwork that fills its own canvas is already a tile. Nothing is redrawn,
    // but where its edge is a flat colour the tile can continue it, so the two
    // read as one shape instead of a square sitting inside a box.
    if transparentFraction < opaqueBelow {
      let border = dominantBorder(pixels, width, height)
      guard let border else {
        return plain().merging(frame(pixels, width, height, nil)) { a, _ in a }
      }
      // Measured against the border colour rather than transparency: filled
      // artwork has none, and its margin is that flat colour.
      let result: [String: Any] = ["kind": "prepared", "uri": url, "color": hex(border)]
      return result.merging(frame(pixels, width, height, border)) { a, _ in a }
    }

    if hueSpread > multiHueAbove {
      // Several hues, so the mark keeps its colours -- but if the lettering
      // beside them is dark, the tile has to be light or the name cannot be
      // read. The image itself is untouched, so no copy is written.
      let hasWordmark = opaque > 0 && Double(achromatic) / Double(opaque) >= wordmarkShareAbove
      let darkWordmark =
        achromatic > 0 && Double(achromaticDark) / Double(achromatic) >= wordmarkDarkAbove
      let shape = frame(pixels, width, height, nil)
      if hasWordmark && darkWordmark {
        let result: [String: Any] = ["kind": "prepared", "color": hex(tilePaper)]
        return result.merging(shape) { a, _ in a }
      }
      return plain().merging(shape) { a, _ in a }
    }

    // A mark with no colour in it has no colour to put behind it -- but if the
    // ink is dark it is invisible against the near-black tile, and that is the
    // one case where leaving a logo alone is worse than touching it. Turning it
    // white costs nothing, since there is no colour to lose.
    //
    // Which is the same redraw as below with a different tile, so it is the same
    // code: the mark goes white and its enclosed holes take the tile's colour.
    let tile: UInt32
    if colorfulFraction < needsColorAbove || hueCount == 0 {
      var dark = 0
      for i in 0..<pixels.count where kind[i] != clear {
        if toHSL(pixels[i]).l < darkInkLightness { dark += 1 }
      }
      if opaque == 0 || Double(dark) / Double(opaque) < darkInkAbove {
        return plain().merging(frame(pixels, width, height, nil)) { a, _ in a }
      }
      tile = tileBase
    } else {
      // Darkened before it is used anywhere: the holes are painted with it and
      // the tile is set to it, and both need the white mark to read against
      // them.
      tile = darken(accent)
    }

    recolorEnclosed(&pixels, kind, width, height, tile)

    for i in 0..<pixels.count where kind[i] == mark {
      pixels[i] = argb(alpha(pixels[i]), 255, 255, 255)
    }

    // Taken before the write only for clarity; the redraw changes colours and
    // never alpha, so the artwork occupies the same rectangle either way.
    let shape = frame(pixels, width, height, nil)
    guard let uri = write(url: url, pixels: pixels, width: width, height: height) else {
      return plain().merging(shape) { a, _ in a }
    }

    // A colourless mark asks for no tile of its own, and saying so lets the tile
    // stay whatever the app's base happens to be under either theme.
    var result: [String: Any] = ["kind": "prepared", "uri": uri]
    if tile != tileBase { result["color"] = hex(tile) }
    return result.merging(shape) { a, _ in a }
  }

  /**
   * Paints every light region that is mostly ringed by the mark.
   *
   * Four-way neighbours throughout: a one-pixel diagonal gap, which
   * anti-aliasing produces constantly, would otherwise join a hole to the
   * outside and halve its measured surroundedness.
   */
  private static func recolorEnclosed(
    _ pixels: inout [UInt32],
    _ kind: [Int],
    _ width: Int,
    _ height: Int,
    _ accent: UInt32
  ) {
    var seen = [Bool](repeating: false, count: kind.count)
    var queue = [Int]()
    var region = [Int]()

    for start in 0..<kind.count where kind[start] == light && !seen[start] {
      region.removeAll(keepingCapacity: true)
      queue.removeAll(keepingCapacity: true)
      queue.append(start)
      seen[start] = true

      var touchingMark = 0
      var touchingRest = 0
      var head = 0

      while head < queue.count {
        let i = queue[head]
        head += 1
        region.append(i)
        let x = i % width
        let y = i / width

        for n in 0..<4 {
          let nx = x + (n == 0 ? -1 : n == 1 ? 1 : 0)
          let ny = y + (n == 2 ? -1 : n == 3 ? 1 : 0)

          if nx < 0 || nx >= width || ny < 0 || ny >= height {
            // The image edge counts as the outside, so a region running off it
            // is not enclosed by anything.
            touchingRest += 1
            continue
          }

          let j = ny * width + nx
          if kind[j] == light {
            if !seen[j] {
              seen[j] = true
              queue.append(j)
            }
          } else if kind[j] == mark {
            touchingMark += 1
          } else {
            touchingRest += 1
          }
        }
      }

      let border = touchingMark + touchingRest
      if border == 0 { continue }
      if Double(touchingMark) / Double(border) < surroundedAbove { continue }

      for i in region {
        pixels[i] = argb(alpha(pixels[i]), red(accent), green(accent), blue(accent))
      }
    }
  }

  /**
   * The colour the outer ring is mostly made of, when one colour holds it.
   *
   * Bucketed rather than averaged: a wordmark running out to the edge puts a
   * few of its own pixels in the sample, and an average moves to a colour that
   * is nowhere on the edge at all. See the Kotlin for the logos that showed it.
   */
  private static func dominantBorder(
    _ pixels: [UInt32], _ width: Int, _ height: Int
  ) -> UInt32? {
    var ring = [UInt32]()
    for x in 0..<width {
      for y in [0, 1, height - 2, height - 1] where y >= 0 && y < height {
        let p = pixels[y * width + x]
        if alpha(p) > 200 { ring.append(p) }
      }
    }
    for y in 0..<height {
      for x in [0, 1, width - 2, width - 1] where x >= 0 && x < width {
        let p = pixels[y * width + x]
        if alpha(p) > 200 { ring.append(p) }
      }
    }
    if ring.isEmpty { return nil }

    func bucket(_ p: UInt32) -> Int {
      (red(p) / borderBucket << 16) | (green(p) / borderBucket << 8) | (blue(p) / borderBucket)
    }

    var counts = [Int: Int]()
    for p in ring { counts[bucket(p), default: 0] += 1 }
    guard let heaviest = counts.max(by: { $0.value < $1.value })?.key else { return nil }

    var r = 0, g = 0, b = 0, members = 0
    for p in ring where bucket(p) == heaviest {
      r += red(p)
      g += green(p)
      b += blue(p)
      members += 1
    }
    if members == 0 { return nil }
    let dominant = argb(255, r / members, g / members, b / members)

    var near = 0
    for p in ring {
      let delta = max(
        abs(red(p) - red(dominant)),
        max(abs(green(p) - green(dominant)), abs(blue(p) - blue(dominant)))
      )
      if delta < borderTolerance { near += 1 }
    }

    return Double(near) / Double(ring.count) >= borderMajorityAbove ? dominant : nil
  }

  /**
   * Where the artwork sits inside its canvas, as fractions of it.
   *
   * The background to ignore is transparency for most logos and the flat border
   * colour for filled artwork, which has no transparency to ignore.
   */
  private static func frame(
    _ pixels: [UInt32], _ width: Int, _ height: Int, _ background: UInt32?
  ) -> [String: Any] {
    var left = width, top = height, right = -1, bottom = -1

    for y in 0..<height {
      for x in 0..<width {
        let pixel = pixels[y * width + x]
        let ink: Bool
        if let background {
          ink =
            alpha(pixel) > 128
            && max(
              abs(red(pixel) - red(background)),
              max(
                abs(green(pixel) - green(background)),
                abs(blue(pixel) - blue(background)))
            ) >= borderTolerance
        } else {
          ink = alpha(pixel) >= 128
        }
        if !ink { continue }
        if x < left { left = x }
        if x > right { right = x }
        if y < top { top = y }
        if y > bottom { bottom = y }
      }
    }

    let aspect: [String: Any] = ["aspect": Double(width) / Double(height)]
    // Nothing found means nothing to frame -- a fully transparent image, or
    // filled artwork that is a single flat colour edge to edge.
    if right < left || bottom < top { return aspect }

    let content: [String: Double] = [
      "x": Double(left) / Double(width),
      "y": Double(top) / Double(height),
      "width": Double(right - left + 1) / Double(width),
      "height": Double(bottom - top + 1) / Double(height),
    ]
    return aspect.merging(["content": content]) { a, _ in a }
  }

  // MARK: - Writing

  private static func write(
    url: String, pixels: [UInt32], width: Int, height: Int
  ) -> String? {
    // Premultiplied on the way back out, which is the only 8-bit RGBA form a
    // bitmap context takes.
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    for i in 0..<(width * height) {
      let a = alpha(pixels[i])
      let scale = Double(a) / 255
      bytes[i * 4 + 0] = UInt8(min(255, Int(Double(red(pixels[i])) * scale + 0.5)))
      bytes[i * 4 + 1] = UInt8(min(255, Int(Double(green(pixels[i])) * scale + 0.5)))
      bytes[i * 4 + 2] = UInt8(min(255, Int(Double(blue(pixels[i])) * scale + 0.5)))
      bytes[i * 4 + 3] = UInt8(a)
    }

    let space = CGColorSpaceCreateDeviceRGB()
    var image: CGImage?
    bytes.withUnsafeMutableBytes { raw in
      guard
        let context = CGContext(
          data: raw.baseAddress,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: width * 4,
          space: space,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
      else { return }
      image = context.makeImage()
    }
    guard let image else { return nil }

    guard let directory = cacheDirectory() else { return nil }
    let file = directory.appendingPathComponent("logo-" + digest(url) + ".png")

    guard
      let destination = CGImageDestinationCreateWithURL(
        file as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { return nil }

    return file.absoluteString
  }

  private static func cacheDirectory() -> URL? {
    guard
      let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    else { return nil }
    let directory = base.appendingPathComponent("logo-analysis", isDirectory: true)
    if !FileManager.default.fileExists(atPath: directory.path) {
      try? FileManager.default.createDirectory(
        at: directory, withIntermediateDirectories: true)
    }
    return directory
  }

  /// MD5, matching the Kotlin so both platforms name the same file for a URL.
  private static func digest(_ value: String) -> String {
    Insecure.MD5.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}
