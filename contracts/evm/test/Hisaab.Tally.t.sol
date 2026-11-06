// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Each caller's public record: endings when a call is Done, copied volume, kept fees, credit paid.
contract HisaabTallyTest is HisaabBase {
    Hisaab.Ending internal constant RIGHT = Hisaab.Ending.Right;
    Hisaab.Ending internal constant ABOVE = Hisaab.Ending.AboveEntry;
    Hisaab.Ending internal constant WRONG = Hisaab.Ending.Wrong;
    Hisaab.Ending internal constant REFUND = Hisaab.Ending.Refund;

    function _stats(bytes32 caller) internal view returns (Hisaab.CallerStats memory) {
        return hisaab.callerStats(caller);
    }

    function test_Tally_StartsEmpty() public view {
        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.right + s.aboveEntry + s.wrong + s.refunded, 0);
        assertEq(s.filledVolume + s.wrongVolume + s.keptFees + s.creditPaid, 0);
    }

    function test_Tally_RightCountsFilledVolumeAndKeptFees() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 500e6);
        Hisaab.Result[] memory rs = new Hisaab.Result[](2);
        rs[0] = _res(true, 6e6, 0);
        rs[1] = _res(false, 0, 0); // bob's buy never filled
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CallerStatsChanged(CALLER);
        _settle(CALL1, RIGHT, 0, rs);

        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.right, 1);
        assertEq(s.filledVolume, 1000e6, "only filled copies count");
        assertEq(s.keptFees, 6e6);
        assertEq(s.wrong + s.aboveEntry + s.refunded, 0);
    }

    function test_Tally_AboveEntryCountsSeparately() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, ABOVE, 0, _arr1(true, 2e6, 0));
        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.aboveEntry, 1);
        assertEq(s.right, 0);
        assertEq(s.keptFees, 2e6);
    }

    function test_Tally_WrongCountsWrongVolumeAndCreditPaid() public {
        _buildFund();
        Hisaab.CallerStats memory before = _stats(CALLER);
        bytes32 id = _newId();
        _reg(id);
        _pay(id, alice, 1000e6);
        uint256 credit0 = hisaab.creditBalance(alice);
        _settle(id, WRONG, 20e6, _arr1(true, 0, 20e6));
        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.wrong, before.wrong + 1);
        assertEq(s.wrongVolume - before.wrongVolume, 1000e6);
        assertEq(s.filledVolume - before.filledVolume, 1000e6);
        // Her fee was paid in cash, so all of her new credit came out of the caller's fund.
        assertEq(s.creditPaid - before.creditPaid, hisaab.creditBalance(alice) - credit0);
        assertEq(s.creditPaid - before.creditPaid, 20e6);
    }

    function test_Tally_RefundCountsNoVolume() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, REFUND, 0, _arr1(true, 0, 0));
        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.refunded, 1);
        assertEq(s.filledVolume, 0);
        assertEq(s.keptFees, 0);
    }

    function test_Tally_ExpiredCallCountsAsRefunded() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _expire(CALL1, 1);
        Hisaab.CallerStats memory s = _stats(CALLER);
        assertEq(s.refunded, 1);
        assertEq(s.right + s.wrong + s.aboveEntry, 0);
    }

    function test_Tally_EndingCountsOnlyWhenDone() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        Hisaab.CallerStats memory mid = _stats(CALLER);
        assertEq(mid.right, 0, "not Done yet");
        assertEq(mid.filledVolume, 1000e6, "volume counts per batch");
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        Hisaab.CallerStats memory done = _stats(CALLER);
        assertEq(done.right, 1);
        assertEq(done.filledVolume, 2000e6);
        assertEq(done.keptFees, 12e6);
    }

    function test_Tally_CallerIdsKeepSeparateRecords() public {
        bytes32 other = keccak256("priya-the-caller");
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        bytes32 id = _newId();
        _regFull(id, other, wallet2, 5000, uint64(block.timestamp + 30 days));
        _pay(id, bob, 1000e6);
        _settle(id, REFUND, 0, _arr1(true, 0, 0));
        assertEq(_stats(CALLER).right, 1);
        assertEq(_stats(CALLER).refunded, 0);
        assertEq(_stats(other).refunded, 1);
        assertEq(_stats(other).right, 0);
    }

    function test_Tally_EmptyCallStillCounts() public {
        _reg(CALL1);
        _settle(CALL1, WRONG, 0, new Hisaab.Result[](0));
        assertEq(_stats(CALLER).wrong, 1);
        assertEq(_stats(CALLER).wrongVolume, 0);
    }
}
