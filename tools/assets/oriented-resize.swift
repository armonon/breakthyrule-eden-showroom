// Decodes any image macOS can read (PNG, JPEG, HEIC), applies its EXIF orientation so phone photos
// stand upright, scales it to fit `max` pixels on the long side and writes a PNG (alpha kept).
// Usage: oriented-resize <input> <max> <output.png>   → prints "<width> <height>" of the result.
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4, let maxSize = Int(args[2]) else { fputs("usage: oriented-resize <input> <max> <output.png>\n", stderr); exit(2) }
let url = URL(fileURLWithPath: args[1]) as CFURL
guard let source = CGImageSourceCreateWithURL(url, nil) else { fputs("cannot read \(args[1])\n", stderr); exit(1) }
let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: maxSize,
    kCGImageSourceShouldCacheImmediately: true
]
guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { fputs("cannot decode \(args[1])\n", stderr); exit(1) }
let out = URL(fileURLWithPath: args[3]) as CFURL
guard let dest = CGImageDestinationCreateWithURL(out, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fputs("cannot write \(args[3])\n", stderr); exit(1) }
print("\(image.width) \(image.height)")
