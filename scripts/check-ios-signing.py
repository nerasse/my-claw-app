"""Inspect a MyClaw provisioning profile; never create or publish Apple resources."""

import argparse
import datetime
import json
import pathlib
import plistlib
import re
import subprocess
import sys
from typing import Mapping, Optional

UTC = datetime.timezone.utc


def validate_profile(
    profile: Mapping[str, object],
    bundle_id: str,
    team_id: str,
    environment: str,
    device_id: Optional[str] = None,
    now: Optional[datetime.datetime] = None,
) -> list[str]:
    """Reject a profile that cannot serve the requested device or TestFlight build."""
    errors: list[str] = []
    if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", bundle_id) or bundle_id.startswith("org.reactjs.native.example."):
        errors.append("Use a registered explicit Bundle ID, not the React Native template.")
    if not re.fullmatch(r"[A-Z0-9]{10}", team_id):
        errors.append("Team ID must contain ten uppercase letters or digits.")
    if environment not in ("development", "production"):
        errors.append("Environment must be development or production.")
    if profile.get("TeamIdentifier") != [team_id]:
        errors.append("The profile belongs to another Apple team.")
    platform = profile.get("Platform")
    if not isinstance(platform, list) or "iOS" not in platform:
        errors.append("The profile does not support iOS.")
    expires = profile.get("ExpirationDate")
    current = now or datetime.datetime.now(UTC)
    if not isinstance(expires, datetime.datetime):
        errors.append("The profile has no valid expiration date.")
    elif expires.replace(tzinfo=UTC) <= current.astimezone(UTC):
        errors.append("The profile is expired.")
    entitlements = profile.get("Entitlements")
    if not isinstance(entitlements, dict):
        return errors + ["The profile has no valid entitlements."]
    if entitlements.get("application-identifier") != f"{team_id}.{bundle_id}":
        errors.append("The profile does not match the exact Bundle ID and App ID prefix.")
    if entitlements.get("com.apple.developer.team-identifier") != team_id:
        errors.append("The entitlement's Apple team does not match.")
    if entitlements.get("aps-environment") != environment:
        errors.append("The APNs entitlement is missing or uses another environment.")
    attest_environments = entitlements.get("com.apple.developer.devicecheck.appattest-environment")
    attest_allowed = attest_environments == environment or (
        isinstance(attest_environments, list)
        and environment in attest_environments
        and all(value in ("development", "production") for value in attest_environments)
    )
    if not attest_allowed:
        errors.append("The App Attest entitlement is missing or uses another environment.")
    if environment == "development":
        if entitlements.get("get-task-allow") is not True:
            errors.append("Device QA requires a development profile.")
        devices = profile.get("ProvisionedDevices")
        if not device_id or not isinstance(devices, list) or device_id not in devices:
            errors.append("The selected iPhone must be explicitly included in the profile.")
    elif environment == "production":
        if entitlements.get("get-task-allow") is not False:
            errors.append("TestFlight requires a non-debuggable distribution profile.")
        if "ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices"):
            errors.append("TestFlight requires an App Store profile, not ad hoc or enterprise.")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", type=pathlib.Path)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--team-id", required=True)
    parser.add_argument("--environment", choices=("development", "production"), required=True)
    parser.add_argument("--device-id", help="Required for development, omitted for TestFlight.")
    args = parser.parse_args()
    try:
        decoded = subprocess.run(
            ["security", "cms", "-D", "-i", str(args.profile)],
            check=True, capture_output=True, timeout=15,
        )
        profile = plistlib.loads(decoded.stdout)
        if not isinstance(profile, dict):
            raise ValueError("Invalid profile root.")
    except (OSError, subprocess.SubprocessError, ValueError, plistlib.InvalidFileException):
        print("Could not decode the provisioning profile with macOS security.", file=sys.stderr)
        return 2
    errors = validate_profile(profile, args.bundle_id, args.team_id, args.environment, args.device_id)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(json.dumps({"status": "compatible", "profile_name": profile.get("Name"),
                      "team_id": args.team_id, "bundle_id": args.bundle_id,
                      "environment": args.environment,
                      "expires": str(profile.get("ExpirationDate"))}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
