// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Wrong ending: both fees back, credit scaling, set-aside order, ask checks.
contract HisaabWrongTest is HisaabBase {
    Hisaab.Ending internal constant WRONG = Hisaab.Ending.Wrong;
    bytes32 internal E;

    function setUp() public override {
        super.setUp();
        _buildFund(); // CALLER: earned 70e6, credit-only 30e6 -> total $100
        E = _newId();
        _reg(E);
    }

    function _two(uint256 a, uint256 b) internal pure returns (Hisaab.Result[] memory rs) {
        rs = new Hisaab.Result[](2);
        rs[0] = _res(true, 0, a);
        rs[1] = _res(true, 0, b);
    }

    function test_Wrong_ReturnsBothFeesToEachFollower() public {
        _pay(E, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 t0 = bal(treasury);
        uint256 w0 = bal(wallet);
        _settle(E, WRONG, 0, _arr1(true, 0, 0));
        assertEq(bal(alice) - a0, 7e6, "$6 + $1 back in cash");
        assertEq(bal(treasury), t0, "treasury gets nothing on Wrong");
        assertEq(bal(wallet), w0);
        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 30e6);
    }

    function test_Wrong_ScalesAsksAbovehalfTheFund_CreditOnlyFirst() public {
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        uint256 reserve0 = hisaab.creditReserve();
        uint256 a0 = bal(alice);
        uint256 b0 = bal(bob);

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CreditSetAside(E, 30e6, 20e6);
        vm.expectEmit(true, true, true, true, address(hisaab));
        emit Hisaab.CopySettled(E, 0, alice, 7e6, 0, 30e6);
        _settle(E, WRONG, 80e6, _two(48e6, 32e6));

        // totalCredit = min(80, 100/2) = 50; scale 50/80
        assertEq(hisaab.creditBalance(alice), 30e6);
        assertEq(hisaab.creditBalance(bob), 20e6);
        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(bob) - b0, 7e6);
        assertEq(hisaab.creditReserve() - reserve0, 50e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 0, "credit-only drawn first");
        assertEq(hisaab.earnedFund(CALLER), 50e6, "then earned");
        assertEq(hisaab.creditSetAside(E), 0);
        Hisaab.CallInfo memory c = hisaab.getCall(E);
        assertEq(c.totalAsk, 80e6);
        assertEq(c.asksSeen, 80e6);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done));
        assertEq(c.escrowCash, 0);
    }

    function test_Wrong_FirstBatchSetsCreditAsideBeforeAnyPayout() public {
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        _settle(E, WRONG, 80e6, _arr1(true, 0, 48e6));
        // after the first batch the whole $50 is already drawn from the fund
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
        assertEq(hisaab.earnedFund(CALLER), 50e6);
        assertEq(hisaab.creditSetAside(E), 20e6, "30 handed to alice, 20 held for bob");
        assertEq(hisaab.creditBalance(alice), 30e6);
        assertEq(hisaab.cursor(E), 1);

        vm.expectEmit(true, true, true, true, address(hisaab));
        emit Hisaab.CopySettled(E, 1, bob, 7e6, 0, 20e6);
        _settle(E, WRONG, 80e6, _arr1(true, 0, 32e6));
        assertEq(hisaab.creditBalance(bob), 20e6);
        assertEq(hisaab.creditSetAside(E), 0);
    }

    function test_Wrong_UnscaledWhenAsksBelowHalfFund_CreditOnlyDrawnFirst() public {
        _pay(E, alice, 1000e6);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CreditSetAside(E, 20e6, 0);
        _settle(E, WRONG, 20e6, _arr1(true, 0, 20e6));
        assertEq(hisaab.creditBalance(alice), 20e6, "ask granted in full");
        assertEq(hisaab.creditOnlyFund(CALLER), 10e6);
        assertEq(hisaab.earnedFund(CALLER), 70e6);
    }

    function test_Wrong_AsksSpillIntoEarnedAfterCreditOnly() public {
        _pay(E, alice, 1000e6);
        _settle(E, WRONG, 45e6, _arr1(true, 0, 45e6));
        assertEq(hisaab.creditBalance(alice), 45e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
        assertEq(hisaab.earnedFund(CALLER), 55e6);
    }

    function test_Wrong_UnissuedCreditReturnsToFundOnFinish() public {
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        _pay(E, carol, 1000e6);
        Hisaab.Result[] memory rs = new Hisaab.Result[](3);
        rs[0] = _res(true, 0, 33_333_333);
        rs[1] = _res(true, 0, 33_333_333);
        rs[2] = _res(true, 0, 13_333_334);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CreditReturned(E, 0, 1);
        _settle(E, WRONG, 80e6, rs);
        assertEq(hisaab.creditBalance(alice), 20_833_333);
        assertEq(hisaab.creditBalance(bob), 20_833_333);
        assertEq(hisaab.creditBalance(carol), 8_333_333);
        // 50e6 drawn, 49_999_999 handed out, 1 unit back to earned
        assertEq(hisaab.earnedFund(CALLER), 50e6 + 1);
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
        assertEq(hisaab.creditSetAside(E), 0);
    }

    function test_Wrong_ZeroTotalAskSetsNothingAside() public {
        _pay(E, alice, 1000e6);
        uint256 reserve0 = hisaab.creditReserve();
        _settle(E, WRONG, 0, _arr1(true, 0, 0));
        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 30e6);
        assertEq(hisaab.creditReserve(), reserve0);
        assertEq(hisaab.creditBalance(alice), 0);
    }

    function test_Wrong_EmptyFundIssuesNoCreditButSettles() public {
        bytes32 other = keccak256("otherCaller");
        _regFull(CALL1, other, wallet, 5000, uint64(block.timestamp + 30 days));
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        _settle(CALL1, WRONG, 100e6, _arr1(true, 0, 100e6));
        assertEq(hisaab.creditBalance(alice), 0);
        assertEq(bal(alice) - a0, 7e6);
    }

    function test_Wrong_CreditPaidCopyReturnsCreditPlusNewCredit() public {
        assertEq(hisaab.creditBalance(priya), 10e6);
        _pay(E, priya, 1000e6); // 6e6 credit + 1e6 cash
        assertEq(hisaab.creditBalance(priya), 4e6);
        uint256 p0 = bal(priya);
        vm.expectEmit(true, true, true, true, address(hisaab));
        emit Hisaab.CopySettled(E, 0, priya, 1e6, 6e6, 10e6);
        _settle(E, WRONG, 10e6, _arr1(true, 0, 10e6));
        assertEq(bal(priya) - p0, 1e6, "only the cash part and platform fee in cash");
        assertEq(hisaab.creditBalance(priya), 4e6 + 6e6 + 10e6);
    }

    // ------------------------------------------------------------ settler bounds on Wrong
    function test_Wrong_AskAboveThirtyPercentMinusCallFeeReverts() public {
        _pay(E, alice, 1000e6);
        // 30% of $1,000 = $300, minus $6 call fee = $294
        Hisaab.Result[] memory ok = _arr1(true, 0, 294e6);
        Hisaab.Result[] memory bad = _arr1(true, 0, 294e6 + 1);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, E, 0));
        hisaab.settleBatch(E, WRONG, 400e6, bad);
        _settle(E, WRONG, 294e6, ok);
        assertEq(uint8(hisaab.getCall(E).status), uint8(Hisaab.Status.Done));
    }

    function test_Wrong_AskBoundUsesWholeCallFeeEvenIfCreditPaid() public {
        _pay(E, priya, 1000e6); // 6e6 of the call fee paid in credit
        Hisaab.Result[] memory bad = _arr1(true, 0, 294e6 + 1);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, E, 0));
        hisaab.settleBatch(E, WRONG, 400e6, bad);
    }

    function test_Wrong_KeptFeeMustBeZero() public {
        _pay(E, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 1, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, E, 0));
        hisaab.settleBatch(E, WRONG, 0, rs);
    }

    function test_Wrong_AsksPastTotalAskReverts() public {
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        Hisaab.Result[] memory rs = _two(50e6, 50e6);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidTotalAsk.selector, E, 30e6, 50e6));
        hisaab.settleBatch(E, WRONG, 80e6, rs);
    }

    function test_Wrong_LastBatchAsksMustEqualTotalAsk() public {
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        Hisaab.Result[] memory rs = _two(30e6, 30e6);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidTotalAsk.selector, E, 80e6, 60e6));
        hisaab.settleBatch(E, WRONG, 80e6, rs);
        // the failed batch left no trace
        Hisaab.CallInfo memory c = hisaab.getCall(E);
        assertEq(c.cursor, 0);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Open));
        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 30e6);
        // exact total works
        _settle(E, WRONG, 60e6, rs);
    }

    function test_Wrong_LastBatchCheckAcrossBatches() public {
        _payMany(E, alice, 1e6, 55);
        // totalAsk 5.5e6, each ask 100_000
        _settle(E, WRONG, 5_500_000, _uniform(50, true, 0, 100_000));
        assertEq(hisaab.getCall(E).asksSeen, 5_000_000);
        Hisaab.Result[] memory shortRs = _uniform(5, true, 0, 90_000);
        Hisaab.Result[] memory goodRs = _uniform(5, true, 0, 100_000);
        vm.startPrank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidTotalAsk.selector, E, 5_500_000, 5_450_000));
        hisaab.settleBatch(E, WRONG, 5_500_000, shortRs);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InconsistentEnding.selector, E));
        hisaab.settleBatch(E, WRONG, 5_400_000, goodRs);
        hisaab.settleBatch(E, WRONG, 5_500_000, goodRs);
        vm.stopPrank();
        assertEq(uint8(hisaab.getCall(E).status), uint8(Hisaab.Status.Done));
        assertEq(hisaab.creditBalance(alice), 55 * 100_000);
    }

    // ------------------------------------------------------------ fuzz
    function testFuzz_Wrong_ScalingNeverExceedsHalfFundAndConservesUSDC(uint256 a1, uint256 a2) public {
        a1 = bound(a1, 0, 294e6);
        a2 = bound(a2, 0, 294e6);
        uint256 total = a1 + a2;
        _pay(E, alice, 1000e6);
        _pay(E, bob, 1000e6);
        uint256 fundBefore = hisaab.earnedFund(CALLER) + hisaab.creditOnlyFund(CALLER) + hisaab.creditReserve();
        uint256 totalCredit = total < 50e6 ? total : 50e6;

        _settle(E, WRONG, total, _two(a1, a2));

        uint256 c1 = hisaab.creditBalance(alice);
        uint256 c2 = hisaab.creditBalance(bob);
        assertEq(c1, total == 0 ? 0 : (a1 * totalCredit) / total);
        assertEq(c2, total == 0 ? 0 : (a2 * totalCredit) / total);
        assertLe(c1 + c2, totalCredit);
        assertLe(c1 + c2, 50e6, "at most half of both fund parts");
        // fund + reserve + set aside conserved; nothing left set aside once Done
        assertEq(hisaab.creditSetAside(E), 0);
        uint256 fundAfter = hisaab.earnedFund(CALLER) + hisaab.creditOnlyFund(CALLER) + hisaab.creditReserve();
        assertEq(fundAfter, fundBefore);
        // credit-only is drawn first: earned only shrinks once credit issued exceeds the credit-only slice
        if (c1 + c2 <= 30e6) assertGe(hisaab.earnedFund(CALLER), 70e6);
    }
}
