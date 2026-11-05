// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Batching across the 50-copy boundary and the cursor.
contract HisaabBatchTest is HisaabBase {
    Hisaab.Ending internal constant RIGHT = Hisaab.Ending.Right;

    function _kept(uint256 i) internal pure returns (uint256) {
        return 1000 + i; // below the 6000 call fee of a $1 copy
    }

    function _slice(uint256 from, uint256 n) internal pure returns (Hisaab.Result[] memory rs) {
        rs = new Hisaab.Result[](n);
        for (uint256 i; i < n; ++i) {
            rs[i] = _res(true, _kept(from + i), 0);
        }
    }

    function test_Batch_120Copies_Settles50_50_20() public {
        _regShare(CALL1, 5010);
        _payMany(CALL1, alice, 1e6, 120);
        assertEq(hisaab.cursor(CALL1), 0);

        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        uint256 a0 = bal(alice);

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 0, 50, RIGHT);
        _settle(CALL1, RIGHT, 0, _slice(0, 50));
        assertEq(hisaab.cursor(CALL1), 50);
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Settling));
        assertEq(c.escrowCash, 70 * 7000);
        assertEq(bal(treasury) - t0, 50 * 1000, "treasury paid in the same batch");

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 50, 100, RIGHT);
        _settle(CALL1, RIGHT, 0, _slice(50, 50));
        assertEq(hisaab.cursor(CALL1), 100);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Settling));

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 100, 120, RIGHT);
        _settle(CALL1, RIGHT, 0, _slice(100, 20));
        c = hisaab.getCall(CALL1);
        assertEq(c.cursor, 120);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done));
        assertEq(c.escrowCash, 0);

        uint256 expectCut;
        uint256 expectKept;
        for (uint256 i; i < 120; ++i) {
            expectKept += _kept(i);
            expectCut += (_kept(i) * 5010) / 10_000;
        }
        assertEq(bal(wallet) - w0, expectCut);
        assertEq(hisaab.earnedFund(CALLER), expectKept - expectCut);
        assertEq(bal(treasury) - t0, 120 * 1000);
        assertEq(bal(alice) - a0, 120 * 6000 - expectKept, "follower gets the unkept call fee back");
    }

    function test_Batch_ExactlyFiftyInOneBatch() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 50);
        _settle(CALL1, RIGHT, 0, _slice(0, 50));
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
        assertEq(hisaab.cursor(CALL1), 50);
    }

    function test_Batch_FiftyOneInOneBatchReverts() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 60);
        Hisaab.Result[] memory rs = _slice(0, 51);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 51, 60));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
    }

    function test_Batch_CannotOverrunRemainingCopies() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 55);
        _settle(CALL1, RIGHT, 0, _slice(0, 50));
        Hisaab.Result[] memory rs = _slice(50, 6);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 6, 5));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        _settle(CALL1, RIGHT, 0, _slice(50, 5));
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }

    function test_Batch_ResultsIndexedFromCursor() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        _pay(CALL1, carol, 1000e6);
        uint256 b0 = bal(bob);
        uint256 c0 = bal(carol);
        // first batch: alice only
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        // second batch starts at the cursor (bob = unfilled, carol = filled)
        Hisaab.Result[] memory rs = new Hisaab.Result[](2);
        rs[0] = _res(false, 0, 0);
        rs[1] = _res(true, 6e6, 0);
        _settle(CALL1, RIGHT, 0, rs);
        assertEq(bal(bob) - b0, 7e6, "bob (copy 1) got the unfilled result");
        assertEq(bal(carol), c0, "carol (copy 2) got the filled result");
    }

    function test_Batch_RoundingIndependentOfBatchBoundaries() public {
        bytes32 c1 = keccak256("c1");
        bytes32 c2 = keccak256("c2");
        _regFull(CALL1, c1, wallet, 5010, uint64(block.timestamp + 30 days));
        _regFull(CALL2, c2, wallet2, 5010, uint64(block.timestamp + 30 days));
        _payMany(CALL1, alice, 10e6, 60);
        _payMany(CALL2, alice, 10e6, 60);
        uint256 w0 = bal(wallet);
        uint256 w20 = bal(wallet2);

        _settle(CALL1, RIGHT, 0, _slice(0, 50));
        _settle(CALL1, RIGHT, 0, _slice(50, 10));
        for (uint256 from; from < 60; from += 17) {
            uint256 n = from + 17 > 60 ? 60 - from : 17;
            _settle(CALL2, RIGHT, 0, _slice(from, n));
        }
        assertEq(bal(wallet) - w0, bal(wallet2) - w20);
        assertEq(hisaab.earnedFund(c1), hisaab.earnedFund(c2));
        assertEq(uint8(hisaab.getCall(CALL2).status), uint8(Hisaab.Status.Done));
    }

    function test_Batch_EachCopySettlesOnce() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 2);
        _settle(CALL1, RIGHT, 0, _slice(0, 2));
        Hisaab.Result[] memory rs = _slice(0, 1);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
    }

    function test_Batch_PausedDoesNotBlockSettlement() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        vm.prank(owner);
        hisaab.pause();
        vm.prank(settler);
        hisaab.startSettlement(CALL1);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }
}
