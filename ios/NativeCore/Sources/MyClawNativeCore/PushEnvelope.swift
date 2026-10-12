import Foundation

public enum PushEnvelope {
  public static func decode(_ values: [AnyHashable: Any]) -> PushOpen? {
    guard let payload = values["myclaw"] as? [String: Any], let rawOrigin = payload["origin"] as? String,
      let address = try? ServerAddress(rawOrigin), address.origin == rawOrigin,
      let registration = payload["registrationId"] as? String, UUID(uuidString: registration) != nil,
      let target = payload["target"] as? [String: Any], let kind = target["kind"] as? String else { return nil }
    let id: String
    let destination: PushTarget
    if kind == "thread", let value = target["threadId"] as? String { id = value; destination = .thread(value) }
    else if kind == "job", let value = target["jobId"] as? String { id = value; destination = .job(value) }
    else { return nil }
    guard id.range(of: "^[A-Za-z0-9._-]{1,64}$", options: .regularExpression) != nil else { return nil }
    return PushOpen(origin: address.origin, registrationId: registration, target: destination)
  }
}
