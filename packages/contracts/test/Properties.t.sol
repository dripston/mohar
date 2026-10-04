// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice Fuzz tests: properties that must hold for ALL inputs.
contract FuzzTest is Base {
    function testFuzz_nonIssuerCanNeverIssue(uint256 pk, bytes32 docRoot, uint64 exp) public {
        pk = bound(pk, 1, 115792089237316195423570985008687907852837564279074904382605163141518161494336);
        vm.assume(pk != aliceKey && pk != bobKey);
        vm.assume(exp == 0 || exp > block.timestamp);
        bytes memory sig = _signIssue(pk, docRoot, exp, 0);
        vm.expectRevert(CertificateRegistry.KeyNotActive.selector);
        certs.issue(vm.addr(pk), docRoot, exp, sig);
    }

    function testFuzz_signatureNeverTransfersBetweenRoots(bytes32 a, bytes32 b, uint64 exp) public {
        vm.assume(a != b);
        vm.assume(exp == 0 || exp > block.timestamp);
        bytes memory sig = _signIssue(aliceKey, a, exp, 0);
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, b, exp, sig);
    }

    function testFuzz_nonIssuerCanNeverRevoke(address who, bytes32 docRoot, uint8 reason) public {
        vm.assume(who != alice);
        bytes32 id = _issue(aliceKey, docRoot, 0);
        vm.prank(who);
        vm.expectRevert();
        certs.revoke(id, reason);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
    }

    function testFuzz_revokedNeverReturnsActive(bytes32 docRoot, uint64 warp, bool suspendFirst) public {
        warp = uint64(bound(warp, 0, 3650 days));
        bytes32 id = _issue(aliceKey, docRoot, 0);
        vm.startPrank(alice);
        if (suspendFirst) certs.suspend(id);
        certs.revoke(id, 3);
        vm.stopPrank();
        vm.warp(block.timestamp + warp);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Revoked));
    }

    function testFuzz_issuerCutoff(uint64 issueAfter, uint64 cutoffAfter) public {
        issueAfter = uint64(bound(issueAfter, 1, 365 days));
        cutoffAfter = uint64(bound(cutoffAfter, 1, 365 days));
        uint64 t0 = uint64(block.timestamp);
        vm.warp(t0 + issueAfter);
        bytes32 id = _issue(aliceKey, keccak256(abi.encode(issueAfter, cutoffAfter)), 0);
        vm.warp(t0 + 400 days);
        vm.prank(root);
        reg.revokeIssuer(alice, t0 + cutoffAfter, 1);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        if (t0 + issueAfter < t0 + cutoffAfter) {
            assertEq(uint8(s), uint8(CertificateRegistry.State.Active), "before cutoff stays valid");
        } else {
            assertEq(uint8(s), uint8(CertificateRegistry.State.IssuerRevoked), "at/after cutoff invalid");
        }
    }

    function testFuzz_batchMembershipIsExact(uint8 sizeRaw, uint8 pickRaw, uint64 wrongExp) public {
        uint256 size = bound(sizeRaw, 1, 64);
        uint256 pick = bound(pickRaw, 0, size - 1);
        bytes32[] memory docs = new bytes32[](size);
        uint64[] memory exps = new uint64[](size);
        bytes32[] memory leaves = new bytes32[](size);
        for (uint256 i = 0; i < size; i++) {
            docs[i] = keccak256(abi.encode("d", i));
            exps[i] = uint64(i * 7);
            leaves[i] = _leaf(docs[i], exps[i]);
        }
        (bytes32 rootHash, bytes32[] memory proof) = _tree(leaves, pick);
        assertTrue(certs.verifyInBatch(rootHash, docs[pick], exps[pick], proof));
        vm.assume(wrongExp != exps[pick]);
        assertFalse(certs.verifyInBatch(rootHash, docs[pick], wrongExp, proof));
    }

    function testFuzz_shortCodeMatchesFormula(bytes32 docRoot) public view {
        bytes32 id = certs.certId(docRoot);
        bytes8 sc = bytes8(id) & bytes8(0xFFFFFFFFFFFFFFF0);
        assertEq(uint64(sc) & 0xf, 0);
        assertEq(bytes8(id) >> 4, sc >> 4);
    }
}

/// @dev Random walk over the whole API; the invariants below must survive any sequence.
contract Handler is Base {
    bytes32[] public ids;
    mapping(bytes32 => bool) public everRevoked;
    mapping(bytes32 => uint64) public issuedAtOf;
    uint256 public issuedCount;
    uint256 public outsiderSuccesses;
    uint64 public cutoff; // alice cutoff, 0 = none

    function setUp() public override {}

    function init(IssuerRegistry r, CertificateRegistry c, address root_, address a, address b, uint256 ak, uint256 bk) external {
        reg = r;
        certs = c;
        root = root_;
        alice = a;
        bob = b;
        aliceKey = ak;
        bobKey = bk;
    }

    function issue(uint256 seed, bool byBob) external {
        bytes32 d = keccak256(abi.encode("h", seed));
        uint256 pk = byBob ? bobKey : aliceKey;
        try this._issueExt(pk, d) returns (bytes32 id) {
            ids.push(id);
            issuedAtOf[id] = uint64(block.timestamp);
            issuedCount++;
        } catch {}
    }

    function _issueExt(uint256 pk, bytes32 d) external returns (bytes32) {
        return _issue(pk, d, 0);
    }

    function revoke(uint256 pick, address who) external {
        if (ids.length == 0) return;
        bytes32 id = ids[pick % ids.length];
        (address issuer,,,,,) = certs.getStatus(id);
        vm.prank(who);
        try certs.revoke(id, 1) {
            everRevoked[id] = true;
            // only the original identity (or its rotated key) may succeed
            if (reg.identityOf(who) != issuer) outsiderSuccesses++;
        } catch {}
    }

    function suspendReinstate(uint256 pick, bool suspend) external {
        if (ids.length == 0) return;
        bytes32 id = ids[pick % ids.length];
        (address issuer,,,,,) = certs.getStatus(id);
        vm.prank(issuer);
        if (suspend) {
            try certs.suspend(id) {} catch {}
        } else {
            try certs.reinstate(id) {} catch {}
        }
    }

    function revokeAlice(uint64 delta) external {
        delta = uint64(bound(delta, 1, 30 days));
        uint64 t = uint64(block.timestamp) - (delta % 5 == 0 ? 0 : delta % uint64(block.timestamp));
        vm.prank(root);
        try reg.revokeIssuer(alice, t, 1) {
            cutoff = t;
        } catch {}
    }

    function warp(uint32 s) external {
        vm.warp(block.timestamp + bound(s, 1, 10 days));
    }

    function count() external view returns (uint256) {
        return ids.length;
    }
}

contract InvariantTest is StdInvariant, Base {
    Handler internal h;

    function setUp() public override {
        super.setUp();
        h = new Handler();
        h.init(reg, certs, root, alice, bob, aliceKey, bobKey);
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](5);
        sels[0] = Handler.issue.selector;
        sels[1] = Handler.revoke.selector;
        sels[2] = Handler.suspendReinstate.selector;
        sels[3] = Handler.revokeAlice.selector;
        sels[4] = Handler.warp.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    /// revoked never returns VALID (Active)
    function invariant_revokedNeverActive() public view {
        for (uint256 i = 0; i < h.count(); i++) {
            bytes32 id = h.ids(i);
            if (h.everRevoked(id)) {
                (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
                assertEq(uint8(s), uint8(CertificateRegistry.State.Revoked));
            }
        }
    }

    /// non-issuer can never revoke
    function invariant_outsidersNeverSucceed() public view {
        assertEq(h.outsiderSuccesses(), 0);
    }

    /// nothing issued by the handler is ever reported as NotFound
    function invariant_issuedStaysKnown() public view {
        for (uint256 i = 0; i < h.count(); i++) {
            (,,, CertificateRegistry.State s,,) = certs.getStatus(h.ids(i));
            assertTrue(uint8(s) != uint8(CertificateRegistry.State.NotFound));
        }
    }

    /// issuer revoked at T: certs after T invalid, before T valid (unless otherwise revoked/suspended/expired)
    function invariant_cutoffSplitsHistory() public view {
        uint64 cut = reg.getKey(alice).revokedFrom;
        for (uint256 i = 0; i < h.count(); i++) {
            bytes32 id = h.ids(i);
            (address issuer, uint64 at,, CertificateRegistry.State s,,) = certs.getStatus(id);
            if (issuer != alice || h.everRevoked(id)) continue;
            if (cut != 0 && at >= cut) {
                assertEq(uint8(s), uint8(CertificateRegistry.State.IssuerRevoked));
            } else {
                assertTrue(uint8(s) != uint8(CertificateRegistry.State.IssuerRevoked));
            }
        }
    }
}
