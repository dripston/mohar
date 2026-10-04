// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Review item 3: golden canonicalisation vectors produced by mohar-core (TypeScript). For every edge-case
///         document (NFD input, empty string, null, -0, Devanagari, emoji, RTL, shuffled keys) Solidity re-derives each
///         salted leaf from (path, value, salt) with abi.encode and proves it into the TS document root, so the same
///         certificate gives the same root in both languages.
contract GoldenTest is Test {
    using stdJson for string;

    function test_goldenVectors_proveIntoTheTypeScriptRoots() public view {
        string memory j = vm.readFile("test/vectors/golden.json");
        uint256 docs;
        for (uint256 d = 0; d < 20; d++) {
            string memory dp = string.concat(".docs[", vm.toString(d), "]");
            if (!vm.keyExistsJson(j, string.concat(dp, ".name"))) break;
            bytes32 root = j.readBytes32(string.concat(dp, ".documentRoot"));
            uint256 n;
            for (uint256 i = 0; i < 40; i++) {
                string memory fp = string.concat(dp, ".fields[", vm.toString(i), "]");
                if (!vm.keyExistsJson(j, string.concat(fp, ".path"))) break;
                string memory path = j.readString(string.concat(fp, ".path"));
                string memory value = j.readString(string.concat(fp, ".value"));
                bytes32 salt = j.readBytes32(string.concat(fp, ".salt"));
                bytes32[] memory proof = j.readBytes32Array(string.concat(fp, ".proof"));
                bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(path, value, salt))));
                assertTrue(MerkleProof.verify(proof, root, leaf), string.concat("leaf ", path));
                n++;
            }
            assertGt(n, 1, "document has fields + count leaf");
            docs++;
        }
        assertEq(docs, 5, "five golden documents");
    }

    /// The exact bytes of tricky values: NFC composed e-acute is c3a9 (never 65 cc 81), the empty string is `""`, null is `null`.
    function test_goldenValues_haveTheExpectedBytes() public view {
        string memory j = vm.readFile("test/vectors/golden.json");
        // doc 1 = unicode-nfc, field recipient.name -> "José" in NFC
        bool found;
        for (uint256 i = 0; i < 10; i++) {
            string memory fp = string.concat(".docs[1].fields[", vm.toString(i), "]");
            if (!vm.keyExistsJson(j, string.concat(fp, ".path"))) break;
            if (keccak256(bytes(j.readString(string.concat(fp, ".path")))) == keccak256("recipient.name")) {
                assertEq(bytes(j.readString(string.concat(fp, ".value"))), bytes.concat('"Jos', hex"c3a9", '"'));
                found = true;
            }
        }
        assertTrue(found, "recipient.name present");
    }
}
