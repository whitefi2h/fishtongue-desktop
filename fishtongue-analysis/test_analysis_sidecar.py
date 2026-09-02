import json
import os
import pathlib
import subprocess
import sys
import unittest


ROOT = pathlib.Path(__file__).parent


def request(message):
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "analysis_sidecar.py")],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    output, error = process.communicate(json.dumps(message, ensure_ascii=False) + "\n", timeout=10)
    if error:
        raise AssertionError(error)
    lines = output.splitlines()
    if len(lines) != 2:
        raise AssertionError(f"Expected ready handshake and one response, got: {output!r}")
    ready = json.loads(lines[0])
    if ready.get("event") != "ready" or ready.get("protocolVersion") != 1:
        raise AssertionError(f"Invalid ready handshake: {ready!r}")
    return json.loads(lines[1])


class AnalysisProtocolTests(unittest.TestCase):
    def test_protocol_rejects_unknown_version(self):
        response = request({
            "protocolVersion": 99,
            "nonce": "n",
            "method": "validate_ipa",
            "payload": {"ipa": "a"},
        })
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "PROTOCOL_MISMATCH")

    def test_protocol_rejects_unknown_message(self):
        response = request({
            "protocolVersion": 1,
            "nonce": "n",
            "method": "read_project",
            "payload": {},
        })
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "INVALID_REQUEST")

    def test_nonce_is_returned_unchanged(self):
        response = request({
            "protocolVersion": 1,
            "nonce": "fixed-nonce",
            "method": "validate_ipa",
            "payload": {"ipa": "a"},
        })
        self.assertEqual(response["nonce"], "fixed-nonce")
        if response["ok"]:
            self.assertEqual(response["result"]["segments"], ["a"])
        else:
            if os.environ.get("FISHTONGUE_REQUIRE_PANPHON") == "1":
                self.fail(response)
            self.assertEqual(response["error"]["code"], "PANPHON_UNAVAILABLE")

    def test_describes_named_features_and_ranks_deterministically(self):
        description = request({
            "protocolVersion": 1,
            "nonce": "features",
            "method": "describe_segments",
            "payload": {"ipa": "pa"},
        })
        if not description["ok"]:
            if os.environ.get("FISHTONGUE_REQUIRE_PANPHON") == "1":
                self.fail(description)
            self.skipTest("PanPhon is not installed in the system Python")
        self.assertIn("voi", description["result"][0]["features"])
        ranked = request({
            "protocolVersion": 1,
            "nonce": "ranking",
            "method": "rank_segment_mappings",
            "payload": {
                "sourceIpa": "p",
                "targetPhonemes": ["b", "m", "a"],
                "distanceWeights": {"voi": 4},
                "limit": 3,
            },
        })
        self.assertTrue(ranked["ok"])
        target_order = {"b": 0, "m": 1, "a": 2}
        self.assertEqual(ranked["result"], sorted(
            ranked["result"],
            key=lambda item: (item["distance"], target_order[item["target"]]),
        ))

    def test_recognizes_common_ipa_symbols_on_windows(self):
        response = request({
            "protocolVersion": 1,
            "nonce": "common-ipa",
            "method": "validate_ipa",
            "payload": {"ipa": "əʃŋɡ"},
        })
        if not response["ok"]:
            if os.environ.get("FISHTONGUE_REQUIRE_PANPHON") == "1":
                self.fail(response)
            self.skipTest("PanPhon is not installed in the system Python")
        self.assertTrue(response["result"]["valid"])
        self.assertEqual(response["result"]["segments"], ["ə", "ʃ", "ŋ", "ɡ"])
        self.assertEqual(response["result"]["unknown"], [])

    def test_validates_an_ipa_batch_in_one_process(self):
        response = request({
            "protocolVersion": 1,
            "nonce": "ipa-batch",
            "method": "validate_ipas",
            "payload": {"ipas": ["pa", "tə"]},
        })
        if not response["ok"]:
            if os.environ.get("FISHTONGUE_REQUIRE_PANPHON") == "1":
                self.fail(response)
            self.skipTest("PanPhon is not installed in the system Python")
        self.assertEqual(len(response["result"]), 2)
        self.assertEqual(response["result"][0]["segments"], ["p", "a"])
        self.assertEqual(response["result"][1]["segments"], ["t", "ə"])

    def test_unicode_limit_is_enforced(self):
        response = request({
            "protocolVersion": 1,
            "nonce": "long",
            "method": "validate_ipa",
            "payload": {"ipa": "a" * 129},
        })
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "IPA_TOO_LONG")


if __name__ == "__main__":
    unittest.main()
