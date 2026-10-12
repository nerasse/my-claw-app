import Foundation
import MyClawNativeCore

@MainActor public struct DispatchConnectionScheduler: ConnectionScheduler {
  public init() {}

  public func schedule(after seconds: TimeInterval, action: @escaping @MainActor () -> Void) -> any ScheduledAction {
    let pending = DispatchScheduledAction(action: action)
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: pending.work)
    return pending
  }
}

@MainActor private final class DispatchScheduledAction: ScheduledAction {
  let work: DispatchWorkItem
  init(action: @escaping @MainActor () -> Void) {
    work = DispatchWorkItem { MainActor.assumeIsolated { action() } }
  }
  func cancel() { work.cancel() }
}
