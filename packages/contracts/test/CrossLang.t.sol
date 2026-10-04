// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice The cross-language gate: every number below was produced by mohar-core in TypeScript
///         (`pnpm --filter mohar-core vectors`). Solidity re-derives them, so the two can never drift apart.
contract CrossLangTest is Test {
    using stdJson for string;

    string internal j;
    IssuerRegistry internal reg;
    CertificateRegistry internal certs;

    function setUp() public {
        j = vm.readFile("test/vectors/vectors.json");
        vm.warp(1_800_000_000);
        address root = makeAddr("root");
        reg = new IssuerRegistry(root);
        // Deploy at the exact address the TS signatures were produced for (chainId 31337 is Foundry's default).
        address target = j.readAddress(".contract");
        deployCodeTo("CertificateRegistry.sol:CertificateRegistry", abi.encode(reg), target);
        certs = CertificateRegistry(target);
        vm.prank(root);
        reg.registerIssuer(j.readAddress(".signer"), "acharya.ac.in", "Acharya Institute", true);
    }

    function _leafOf(uint256 i) internal view returns (bytes32 leaf, bytes32[] memory proof) {
        string memory base = string.concat(".fields[", vm.toString(i), "]");
        string memory path = j.readString(string.concat(base, ".path"));
        string memory value = j.readString(string.concat(base, ".value"));
        bytes32 salt = j.readBytes32(string.concat(base, ".salt"));
        proof = j.readBytes32Array(string.concat(base, ".proof"));
        leaf = keccak256(bytes.concat(keccak256(abi.encode(path, value, salt))));
    }

    /// Every salted field leaf computed in TS proves into the TS document root using OpenZeppelin's Solidity verifier.
    function test_everyFieldLeafVerifiesInSolidity() public view {
        bytes32 docRoot = j.readBytes32(".documentRoot");
        uint256 n;
        for (uint256 i = 0; i < 40; i++) {
            if (!vm.keyExistsJson(j, string.concat(".fields[", vm.toString(i), "].path"))) break;
            (bytes32 leaf, bytes32[] memory proof) = _leafOf(i);
            assertTrue(MerkleProof.verify(proof, docRoot, leaf), "field proof");
            n++;
        }
        assertEq(n, 11, "10 fields + fieldCount leaf");
    }

    function test_certIdAndShortCodeMatch() public view {
        bytes32 docRoot = j.readBytes32(".documentRoot");
        assertEq(certs.certId(docRoot), j.readBytes32(".certId"));
        bytes8 sc = bytes8(certs.certId(docRoot)) & bytes8(0xFFFFFFFFFFFFFFF0);
        assertEq(bytes32(sc), bytes32(j.readBytes(".shortCodeBytes8")));
    }

    function test_batchProofsMatch() public view {
        bytes32 batchRoot = j.readBytes32(".batchRoot");
        for (uint256 i = 0; i < 7; i++) {
            string memory b = string.concat(".batch[", vm.toString(i), "]");
            bytes32 d = j.readBytes32(string.concat(b, ".documentRoot"));
            uint64 e = uint64(j.readUint(string.concat(b, ".expiresAt")));
            bytes32[] memory proof = j.readBytes32Array(string.concat(b, ".proof"));
            assertTrue(certs.verifyInBatch(batchRoot, d, e, proof), "batch member");
        }
    }

    /// A signature made by viem's signTypedData is accepted by the contract: same domain, same struct hash.
    function test_tsSignaturesAreAcceptedOnChain() public {
        address signer = j.readAddress(".signer");
        bytes32 docRoot = j.readBytes32(".documentRoot");
        certs.issue(signer, docRoot, 0, j.readBytes(".issueSig"));
        (address issuer,,,,,) = certs.getStatus(certs.certId(docRoot));
        assertEq(issuer, signer);

        certs.issueBatch(signer, j.readBytes32(".batchRoot"), 7, j.readBytes(".batchSig"));
        assertEq(certs.getBatch(j.readBytes32(".batchRoot")).count, 7);
    }
}
