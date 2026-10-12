#if os(iOS)
import Foundation
import UIKit
import UniformTypeIdentifiers
import MyClawNativeCore

@MainActor public enum IOSPresentation {
  public static var window: UIWindow? {
    UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first
      ?? UIApplication.shared.delegate?.window ?? nil
  }
  public static func controller() throws -> UIViewController {
    guard UIApplication.shared.applicationState == .active,
      var controller = window?.rootViewController else { throw CocoaError(.userCancelled) }
    while let presented = controller.presentedViewController { controller = presented }
    return controller
  }
}

@MainActor public final class IOSDocuments: NSObject, DocumentSelection, UIDocumentPickerDelegate {
  private enum Pending {
    case selection(CheckedContinuation<[NativeFile], any Error>)
    case export(CheckedContinuation<URL?, any Error>)
  }
  private let files: any FileAccess
  private var pending: Pending?
  public init(files: any FileAccess) { self.files = files; super.init() }

  public func select() async throws -> [NativeFile] {
    let controller = try IOSPresentation.controller()
    guard pending == nil else { throw CocoaError(.userCancelled) }
    return try await withCheckedThrowingContinuation { continuation in
      pending = .selection(continuation)
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
      picker.allowsMultipleSelection = true
      picker.delegate = self
      controller.present(picker, animated: true)
    }
  }

  public func export(_ file: NativeFile) async throws -> URL? {
    let controller = try IOSPresentation.controller()
    guard pending == nil else { throw CocoaError(.userCancelled) }
    return try await withCheckedThrowingContinuation { continuation in
      pending = .export(continuation)
      let picker = UIDocumentPickerViewController(forExporting: [file.uri], asCopy: true)
      picker.delegate = self
      controller.present(picker, animated: true)
    }
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    let operation = pending
    pending = nil
    switch operation {
    case .selection(let continuation): continuation.resume(returning: [])
    case .export(let continuation): continuation.resume(returning: nil)
    case nil: break
    }
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    let operation = pending
    pending = nil
    switch operation {
    case .export(let continuation): continuation.resume(returning: urls.first)
    case .selection(let continuation):
      Task {
        do {
          var selected: [NativeFile] = []
          for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            selected.append(try await files.adoptDownloaded(url, name: url.lastPathComponent))
          }
          continuation.resume(returning: selected)
        } catch { continuation.resume(throwing: error) }
      }
    case nil: break
    }
  }
}
#endif
