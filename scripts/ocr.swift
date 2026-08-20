import AppKit
import Vision

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fputs("cannot load image\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest { request, _ in
  guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
  for observation in observations {
    if let candidate = observation.topCandidates(1).first {
      print(candidate.string)
    }
  }
}
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.recognitionLevel = .accurate

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])
