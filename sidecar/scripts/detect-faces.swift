import AppKit
import Foundation
import Vision

struct FaceBox: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct DetectFacesResult: Codable {
  let width: Int
  let height: Int
  let faces: [FaceBox]
}

func emitAndExit(_ result: DetectFacesResult, _ code: Int32 = 0) -> Never {
  let encoder = JSONEncoder()
  if let data = try? encoder.encode(result), let text = String(data: data, encoding: .utf8) {
    print(text)
  } else {
    print("{\"width\":0,\"height\":0,\"faces\":[]}")
  }
  exit(code)
}

guard CommandLine.arguments.count >= 2 else {
  emitAndExit(DetectFacesResult(width: 0, height: 0, faces: []), 2)
}

let imagePath = CommandLine.arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)
guard let image = NSImage(contentsOf: imageUrl) else {
  emitAndExit(DetectFacesResult(width: 0, height: 0, faces: []), 3)
}

var proposedRect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
  emitAndExit(DetectFacesResult(width: 0, height: 0, faces: []), 4)
}

let request = VNDetectFaceRectanglesRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
} catch {
  emitAndExit(DetectFacesResult(width: cgImage.width, height: cgImage.height, faces: []), 5)
}

let observations = request.results as? [VNFaceObservation] ?? []
let normalizedFaces: [FaceBox] = observations.map { face in
  let box = face.boundingBox
  // Vision 坐标原点在左下，转换成左上角原点，便于和 sharp 对齐。
  let topLeftY = 1.0 - box.origin.y - box.height
  return FaceBox(
    x: Double(box.origin.x),
    y: Double(topLeftY),
    width: Double(box.width),
    height: Double(box.height)
  )
}

emitAndExit(
  DetectFacesResult(width: cgImage.width, height: cgImage.height, faces: normalizedFaces),
  0
)
