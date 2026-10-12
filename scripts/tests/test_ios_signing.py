import copy
import datetime
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "check-ios-signing.py"
SPEC = importlib.util.spec_from_file_location("ios_signing", SCRIPT)
signing = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(signing)

NOW = datetime.datetime(2026, 10, 10, tzinfo=datetime.timezone.utc)
TEAM = "9TU8PY7588"
BUNDLE = "com.kalira.myclaw"
DEVICE = "test-device"


def profile(environment="development"):
    return {
        "TeamIdentifier": [TEAM],
        "Platform": ["iOS"],
        "ExpirationDate": NOW + datetime.timedelta(days=30),
        "Entitlements": {
            "application-identifier": f"{TEAM}.{BUNDLE}",
            "com.apple.developer.team-identifier": TEAM,
            "aps-environment": environment,
            "com.apple.developer.devicecheck.appattest-environment": environment,
            "get-task-allow": environment == "development",
        },
        **({"ProvisionedDevices": [DEVICE]} if environment == "development" else {}),
    }


class SigningTests(unittest.TestCase):
    def check(self, value, environment="development", device_id=DEVICE, bundle=BUNDLE):
        return signing.validate_profile(value, bundle, TEAM, environment, device_id, NOW)

    def test_matching_development_profile_accepts_registered_device(self):
        self.assertEqual(self.check(profile()), [])

    def test_matching_store_profile_accepts_production(self):
        self.assertEqual(self.check(profile("production"), "production", None), [])

    def test_expired_profile_rejected(self):
        value = profile()
        value["ExpirationDate"] = NOW
        self.assertTrue(self.check(value))

    def test_missing_expiration_rejected(self):
        value = profile()
        del value["ExpirationDate"]
        self.assertTrue(self.check(value))

    def test_another_team_rejected(self):
        value = profile()
        value["TeamIdentifier"] = ["OTHERTEAM01"]
        self.assertTrue(self.check(value))

    def test_wildcard_or_another_app_rejected(self):
        for identifier in (f"{TEAM}.*", f"{TEAM}.com.kalira.other"):
            with self.subTest(identifier=identifier):
                value = profile()
                value["Entitlements"]["application-identifier"] = identifier
                self.assertTrue(self.check(value))

    def test_missing_or_wrong_push_environment_rejected(self):
        for environment in (None, "production"):
            with self.subTest(environment=environment):
                value = profile()
                value["Entitlements"]["aps-environment"] = environment
                self.assertTrue(self.check(value))

    def test_missing_or_wrong_attest_environment_rejected(self):
        for environment in (None, "production"):
            with self.subTest(environment=environment):
                value = profile()
                value["Entitlements"]["com.apple.developer.devicecheck.appattest-environment"] = environment
                self.assertTrue(self.check(value))

    def test_apple_profile_can_authorize_both_attest_environments(self):
        for environment in ("development", "production"):
            with self.subTest(environment=environment):
                value = profile(environment)
                value["Entitlements"]["com.apple.developer.devicecheck.appattest-environment"] = ["development", "production"]
                device = DEVICE if environment == "development" else None
                self.assertEqual(self.check(value, environment, device), [])

    def test_attest_environment_array_must_allow_requested_environment(self):
        value = profile()
        value["Entitlements"]["com.apple.developer.devicecheck.appattest-environment"] = ["production"]
        self.assertTrue(self.check(value))

    def test_unregistered_device_rejected(self):
        self.assertTrue(self.check(profile(), device_id="other-device"))

    def test_development_requires_explicit_device(self):
        self.assertTrue(self.check(profile(), device_id=None))

    def test_store_rejects_device_or_enterprise_profile(self):
        for key, value in (("ProvisionedDevices", [DEVICE]), ("ProvisionsAllDevices", True)):
            with self.subTest(key=key):
                store = profile("production")
                store[key] = value
                self.assertTrue(self.check(store, "production", None))

    def test_store_rejects_debuggable_profile(self):
        store = profile("production")
        store["Entitlements"]["get-task-allow"] = True
        self.assertTrue(self.check(store, "production", None))

    def test_template_identifier_rejected(self):
        value = copy.deepcopy(profile())
        template = "org.reactjs.native.example.MyClawApp"
        value["Entitlements"]["application-identifier"] = f"{TEAM}.{template}"
        self.assertTrue(self.check(value, bundle=template))

    def test_malformed_entitlements_fail_explicitly(self):
        value = profile()
        value["Entitlements"] = None
        self.assertTrue(self.check(value))


if __name__ == "__main__":
    unittest.main()
