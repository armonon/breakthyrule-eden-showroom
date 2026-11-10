// Builds the Break Thy Rule logo (rider + "BreakThyRule" + "anonymous archive") as transparent PNGs.
// The rider is lifted off a photo of the old logo: the checkerboard is keyed out by ink colour,
// then the regions enclosed by the line art are filled white so the horse reads on any background.
// Usage: swift tools/assets/build-logo.swift <source-photo> <output-dir>
import AppKit
import CoreImage

let args = CommandLine.arguments
let sourcePath = args.count > 1 ? args[1] : "assets/brand/logo-source-photo.jpg"
let outDir = args.count > 2 ? args[2] : "assets/brand"

guard let source = NSImage(contentsOfFile: sourcePath),
      let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("cannot read \(sourcePath)") }

// 1. Crop the rider (in source pixels, top-left origin) and upscale it smoothly.
let crop = CGRect(x: 18, y: 58, width: 210, height: 262)
let scale: CGFloat = 4
guard let riderCG = cg.cropping(to: crop) else { fatalError("crop failed") }
let ci = CIImage(cgImage: riderCG)
let up = ci.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: 1])
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.1]).cropped(to: CGRect(x: 0, y: 0, width: crop.width * scale, height: crop.height * scale))
let ctx = CIContext()
guard let upCG = ctx.createCGImage(up, from: up.extent) else { fatalError("render failed") }
let w = upCG.width, h = upCG.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let space = CGColorSpaceCreateDeviceRGB()
let bmp = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
bmp.draw(upCG, in: CGRect(x: 0, y: 0, width: w, height: h))

// 2. Ink alpha: maroon lines are warmer than the grey checker; the shadow is darker.
var ink = [Float](repeating: 0, count: w * h)
for i in 0..<(w * h) {
    let r = Float(px[i * 4]), g = Float(px[i * 4 + 1]), b = Float(px[i * 4 + 2])
    let lum = 0.3 * r + 0.59 * g + 0.11 * b
    let warm = (r - (g + b) / 2 - 16) * 7
    let dark = (125 - lum) * 4
    let x = i % w, y = i / w
    let edge = min(min(x, w - 1 - x), min(y, h - 1 - y))
    ink[i] = edge < 8 ? 0 : min(1, max(0, max(warm, dark) / 255))
}

// 3. Flood the outside from the border through a dilated barrier; what the flood can't reach is horse.
let barrierRadius = 7
var solid = [Bool](repeating: false, count: w * h)
for y in 0..<h { for x in 0..<w where ink[y * w + x] > 0.35 {
    for dy in -barrierRadius...barrierRadius { for dx in -barrierRadius...barrierRadius where dx * dx + dy * dy <= barrierRadius * barrierRadius {
        let nx = x + dx, ny = y + dy
        if nx >= 0, ny >= 0, nx < w, ny < h { solid[ny * w + nx] = true }
    } }
} }
var outside = [Bool](repeating: false, count: w * h)
var stack: [Int] = []
for x in 0..<w { stack.append(x); stack.append((h - 1) * w + x) }
for y in 0..<h { stack.append(y * w); stack.append(y * w + w - 1) }
while let i = stack.popLast() {
    if outside[i] || solid[i] { continue }
    outside[i] = true
    let x = i % w, y = i / w
    if x > 0 { stack.append(i - 1) }; if x < w - 1 { stack.append(i + 1) }
    if y > 0 { stack.append(i - w) }; if y < h - 1 { stack.append(i + w) }
}
// Grow "outside" back over the barrier margin so the white fill stays inside the lines.
var fill = [Float](repeating: 0, count: w * h)
for i in 0..<(w * h) where !outside[i] { fill[i] = 1 }
var eroded = fill
let grow = barrierRadius - 1
for y in 0..<h { for x in 0..<w where fill[y * w + x] > 0 {
    var near = false
    outer: for dy in -grow...grow { for dx in -grow...grow where dx * dx + dy * dy <= grow * grow {
        let nx = x + dx, ny = y + dy
        if nx < 0 || ny < 0 || nx >= w || ny >= h || outside[ny * w + nx] { near = true; break outer }
    } }
    if near { eroded[y * w + x] = 0 }
} }

// 4. Paint: deep maroon ink over a white body, everything else transparent.
let inkR: Float = 128, inkG: Float = 28, inkB: Float = 38
var out = [UInt8](repeating: 0, count: w * h * 4)
for i in 0..<(w * h) {
    let a = ink[i], body = eroded[i]
    // Shadow pixels (dark, not warm) render as soft charcoal instead of maroon.
    let r0 = Float(px[i * 4]), g0 = Float(px[i * 4 + 1])
    let shadowy = (r0 - g0) < 10 && r0 < 140
    let b0 = Float(px[i * 4 + 2])
    let cr = shadowy ? Float(40) : min(inkR + 40, r0 * 0.78), cg2 = shadowy ? Float(36) : min(inkG + 30, g0 * 0.55), cb = shadowy ? Float(38) : min(inkB + 30, b0 * 0.6)
    let alpha = min(1, a + body * (1 - a))
    if alpha <= 0 { continue }
    let r = (cr * a + 255 * body * (1 - a)) , g = (cg2 * a + 255 * body * (1 - a)), b = (cb * a + 255 * body * (1 - a))
    // premultiplied
    out[i * 4] = UInt8(min(255, r)); out[i * 4 + 1] = UInt8(min(255, g)); out[i * 4 + 2] = UInt8(min(255, b)); out[i * 4 + 3] = UInt8(alpha * 255)
}
let riderCtx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let rider = riderCtx.makeImage()!

func savePNG(_ image: CGImage, _ name: String) {
    let rep = NSBitmapImageRep(cgImage: image)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: outDir + "/" + name))
    print("wrote \(outDir)/\(name) \(image.width)x\(image.height)")
}
savePNG(rider, "rider.png")

// 5. Compose the lockup.
func lockup(subtitleColor: NSColor, name: String) {
    let H = 600, riderH = 600
    let riderW = Int(CGFloat(riderH) * CGFloat(w) / CGFloat(h))
    let titleFont = NSFont(name: "ArialRoundedMTBold", size: 250)!
    let subFont = NSFont(name: "Verdana-Italic", size: 118)!
    let title = "BreakThyRule", sub = "anonymous archive"
    let titleSize = (title as NSString).size(withAttributes: [.font: titleFont])
    let subSize = (sub as NSString).size(withAttributes: [.font: subFont])
    let textX = riderW - 10
    let W = textX + Int(max(titleSize.width, subSize.width)) + 30
    let c = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.interpolationQuality = .high
    c.draw(rider, in: CGRect(x: 0, y: 0, width: riderW, height: riderH))
    let gc = NSGraphicsContext(cgContext: c, flipped: false)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = gc
    let titleY: CGFloat = 255
    // Embossed red: dark offset layer, then the face with a soft inner highlight.
    let shadow = NSShadow(); shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.28); shadow.shadowOffset = NSSize(width: 4, height: -6); shadow.shadowBlurRadius = 8
    (title as NSString).draw(at: NSPoint(x: CGFloat(textX) + 4, y: titleY - 5), withAttributes: [.font: titleFont, .foregroundColor: NSColor(calibratedRed: 0.42, green: 0.07, blue: 0.10, alpha: 1), .shadow: shadow])
    (title as NSString).draw(at: NSPoint(x: CGFloat(textX), y: titleY), withAttributes: [.font: titleFont, .foregroundColor: NSColor(calibratedRed: 0.76, green: 0.17, blue: 0.22, alpha: 1), .strokeColor: NSColor(calibratedRed: 0.55, green: 0.09, blue: 0.13, alpha: 1), .strokeWidth: -2.5])
    let subX = CGFloat(textX) + (titleSize.width - subSize.width) / 2 + 10
    (sub as NSString).draw(at: NSPoint(x: max(CGFloat(textX), subX), y: 70), withAttributes: [.font: subFont, .foregroundColor: subtitleColor])
    NSGraphicsContext.restoreGraphicsState()
    savePNG(c.makeImage()!, name)
}
lockup(subtitleColor: NSColor(calibratedWhite: 0.11, alpha: 1), name: "logo.png")
