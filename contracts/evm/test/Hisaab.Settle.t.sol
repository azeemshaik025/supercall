// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Right / Above entry / Refund endings, the payout table, the fund and settler bounds.
contract HisaabSettleTest is HisaabBase {
    Hisaab.Ending internal constant RIGHT = Hisaab.Ending.Right;
    Hisaab.Ending internal constant ABOVE = Hisaab.Ending.AboveEntry;
    Hisaab.Ending internal constant REFUND = Hisaab.Ending.Refund;

    function _assertEscrowEmpty(bytes32 id) internal view {
        Hisaab.CallInfo memory c = hisaab.getCall(id);
        assertEq(c.escrowCash, 0, "escrow cash");
        assertEq(c.escrowCredit, 0, "escrow credit");
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done), "done");
        assertEq(c.cursor, c.copyCount);
    }

    // ------------------------------------------------------------ worked examples
    function test_Right_AllCash_PriyaExample() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        uint256 p0 = bal(priya);

        vm.expectEmit(true, true, true, true, address(hisaab));
        emit Hisaab.CopySettled(CALL1, 0, priya, 0, 0, 0);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 0, 1, RIGHT);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));

        assertEq(bal(wallet) - w0, 3_006_000, "Raj wallet $3.006");
        assertEq(hisaab.earnedFund(CALLER), 2_994_000, "fund $2.994");
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
        assertEq(bal(treasury) - t0, 1e6, "treasury $1");
        assertEq(bal(priya), p0, "nothing back to Priya");
        assertEq(hisaab.creditBalance(priya), 0);
        _assertEscrowEmpty(CALL1);
    }

    function test_Right_MixedPaymentExample() public {
        _giveCredit(priya, 2e6);
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6); // $2 credit + $4 cash call fee, $1 platform
        Hisaab.CopyInfo memory cp = hisaab.getCopy(CALL1, 0);
        assertEq(cp.callFeeCredit, 2e6);
        assertEq(cp.callFeeCash, 4e6);

        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        uint256 p0 = bal(priya);
        vm.expectEmit(true, true, true, true, address(hisaab));
        emit Hisaab.CopySettled(CALL1, 0, priya, 2_510_000, 0, 0);
        _settle(CALL1, RIGHT, 0, _arr1(true, 3_490_000, 0));

        assertEq(hisaab.creditOnlyFund(CALLER), 2e6, "$2 credit-kept goes to credit-only");
        assertEq(bal(wallet) - w0, 746_490, "0.74649 to wallet");
        assertEq(hisaab.earnedFund(CALLER), 743_510, "0.74351 earned");
        assertEq(bal(priya) - p0, 2_510_000, "$2.51 cash back");
        assertEq(hisaab.creditBalance(priya), 0, "no credit back");
        assertEq(bal(treasury) - t0, 1e6);
        _assertEscrowEmpty(CALL1);
    }

    function test_Right_1000Example_FullSplit_NoLeak() public {
        // the sum of everything paid out equals what was pulled in
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        uint256 h0 = bal(address(hisaab));
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        // Hisaab keeps exactly the earned fund
        assertEq(h0 - bal(address(hisaab)), 7e6 - hisaab.earnedFund(CALLER));
    }

    // ------------------------------------------------------------ payout table rows
    function test_Right_Unfilled_ReturnsAllCash() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        _settle(CALL1, RIGHT, 0, _arr1(false, 0, 0));
        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(wallet), w0);
        assertEq(bal(treasury), t0, "no platform fee for unfilled copy");
        assertEq(hisaab.earnedFund(CALLER), 0);
        _assertEscrowEmpty(CALL1);
    }

    function test_Right_FilledZeroKept_TreasuryStillGetsPlatformFee() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 t0 = bal(treasury);
        _settle(CALL1, RIGHT, 0, _arr1(true, 0, 0));
        assertEq(bal(alice) - a0, 6e6, "whole call fee returned");
        assertEq(bal(treasury) - t0, 1e6);
        assertEq(hisaab.earnedFund(CALLER), 0);
    }

    function test_Right_PartialKeptAllCash() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 w0 = bal(wallet);
        _settle(CALL1, RIGHT, 0, _arr1(true, 2e6, 0));
        assertEq(bal(alice) - a0, 4e6);
        assertEq(bal(wallet) - w0, 1_002_000); // floor(2e6*5010/10000)
        assertEq(hisaab.earnedFund(CALLER), 998_000);
    }

    function test_Right_CreditPaidFeeKept_GoesToCreditOnlyFund() public {
        _reg(CALL1);
        _giveCredit(priya, 10e6);
        _pay(CALL1, priya, 1000e6); // call fee fully credit-paid, platform $1 cash
        uint256 p0 = bal(priya);
        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        uint256 cr0 = hisaab.creditBalance(priya);
        _settle(CALL1, RIGHT, 0, _arr1(true, 4e6, 0));
        assertEq(hisaab.creditOnlyFund(CALLER), 4e6);
        assertEq(hisaab.earnedFund(CALLER), 0);
        assertEq(bal(wallet), w0, "caller never gets cash from a credit-paid fee");
        assertEq(bal(priya), p0, "no cash back: call fee was all credit and platform fee kept");
        assertEq(hisaab.creditBalance(priya) - cr0, 2e6, "unkept credit returns as credit");
        assertEq(bal(treasury) - t0, 1e6);
        _assertEscrowEmpty(CALL1);
    }

    function test_Right_UnfilledCreditPaidFee_ReturnsCreditAndPlatformCash() public {
        _reg(CALL1);
        _giveCredit(priya, 2e6);
        _pay(CALL1, priya, 1000e6);
        uint256 p0 = bal(priya);
        uint256 cr0 = hisaab.creditBalance(priya);
        _settle(CALL1, RIGHT, 0, _arr1(false, 0, 0));
        assertEq(bal(priya) - p0, 5e6);
        assertEq(hisaab.creditBalance(priya) - cr0, 2e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
    }

    function test_AboveEntry_Filled_HalfCut() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);
        uint256 p0 = bal(priya);
        _settle(CALL1, ABOVE, 0, _arr1(true, 6e6, 0));
        assertEq(bal(wallet) - w0, 1_503_000, "half the cut");
        assertEq(hisaab.earnedFund(CALLER), 4_497_000, "remainder to earned fund");
        assertEq(bal(treasury) - t0, 1e6);
        assertEq(bal(priya), p0);
        _assertEscrowEmpty(CALL1);
    }

    function test_AboveEntry_Mixed_HalfCutOnKeptCash() public {
        _giveCredit(priya, 2e6);
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        uint256 w0 = bal(wallet);
        _settle(CALL1, ABOVE, 0, _arr1(true, 3_490_000, 0));
        assertEq(bal(wallet) - w0, 373_245); // floor(1.49e6 * 5010 / 20000)
        assertEq(hisaab.earnedFund(CALLER), 1_490_000 - 373_245);
        assertEq(hisaab.creditOnlyFund(CALLER), 2e6);
    }

    function test_AboveEntry_Unfilled_ReturnsAllCash() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 t0 = bal(treasury);
        _settle(CALL1, ABOVE, 0, _arr1(false, 0, 0));
        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(treasury), t0);
    }

    function test_Refund_ReturnsBothFeesInCash() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        uint256 t0 = bal(treasury);
        uint256 w0 = bal(wallet);
        _settle(CALL1, REFUND, 0, _arr1(false, 0, 0));
        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(treasury), t0);
        assertEq(bal(wallet), w0);
        assertEq(hisaab.earnedFund(CALLER) + hisaab.creditOnlyFund(CALLER), 0);
        _assertEscrowEmpty(CALL1);
    }

    function test_Refund_CreditPaidFeeReturnsAsCredit() public {
        _reg(CALL1);
        _giveCredit(priya, 2e6);
        _pay(CALL1, priya, 1000e6);
        uint256 p0 = bal(priya);
        _settle(CALL1, REFUND, 0, _arr1(true, 0, 0));
        assertEq(bal(priya) - p0, 5e6, "cash part + platform fee in cash");
        assertEq(hisaab.creditBalance(priya), 2e6, "credit part back as credit");
    }

    // ------------------------------------------------------------ order and fund keying
    function test_Batch_ResultsApplyInCopyOrder() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6); // copy 0
        _pay(CALL1, bob, 1000e6); // copy 1
        uint256 a0 = bal(alice);
        uint256 b0 = bal(bob);
        Hisaab.Result[] memory rs = new Hisaab.Result[](2);
        rs[0] = _res(true, 6e6, 0);
        rs[1] = _res(false, 0, 0);
        _settle(CALL1, RIGHT, 0, rs);
        assertEq(bal(alice), a0, "alice kept fee");
        assertEq(bal(bob) - b0, 7e6, "bob unfilled");
    }

    function test_Fund_KeyedByCallerId_TwoCallsTwoWallets() public {
        _regFull(CALL1, CALLER, wallet, 5000, uint64(block.timestamp + 30 days));
        _regFull(CALL2, CALLER, wallet2, 5000, uint64(block.timestamp + 30 days));
        _pay(CALL1, alice, 1000e6);
        _pay(CALL2, alice, 1000e6);
        uint256 w0 = bal(wallet);
        uint256 w20 = bal(wallet2);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        _settle(CALL2, RIGHT, 0, _arr1(true, 6e6, 0));
        assertEq(bal(wallet) - w0, 3e6);
        assertEq(bal(wallet2) - w20, 3e6);
        assertEq(hisaab.earnedFund(CALLER), 6e6, "one shared fund");
    }

    function test_Fund_SeparateCallerIdsSeparateFunds() public {
        bytes32 other = keccak256("other");
        _reg(CALL1);
        _regFull(CALL2, other, wallet, 5000, uint64(block.timestamp + 30 days));
        _pay(CALL1, alice, 1000e6);
        _pay(CALL2, alice, 1000e6);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        _settle(CALL2, RIGHT, 0, _arr1(true, 2e6, 0));
        assertEq(hisaab.earnedFund(CALLER), 3e6);
        assertEq(hisaab.earnedFund(other), 1e6);
    }

    // ------------------------------------------------------------ fund limit (harness)
    function test_FundLimit_EarnedOverflowGoesToWalletInCash() public {
        hisaab.setLimit(50e6);
        _reg(CALL1);
        _pay(CALL1, bob, 40_000e6); // call fee 240e6
        uint256 w0 = bal(wallet);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.FundChanged(CALLER, 50e6, 0);
        _settle(CALL1, RIGHT, 0, _arr1(true, 240e6, 0));
        // cut 120e6, earned part 120e6 capped to 50e6, overflow 70e6 -> wallet
        assertEq(hisaab.earnedFund(CALLER), 50e6);
        assertEq(bal(wallet) - w0, 190e6);

        // fund is at the limit: every further earned dollar overflows
        _reg(CALL2);
        _pay(CALL2, alice, 1000e6);
        uint256 w1 = bal(wallet);
        _settle(CALL2, RIGHT, 0, _arr1(true, 6e6, 0));
        assertEq(hisaab.earnedFund(CALLER), 50e6);
        assertEq(bal(wallet) - w1, 6e6);
    }

    function test_FundLimit_DoesNotApplyToCreditOnly() public {
        _giveCredit(priya, 10e6);
        hisaab.setLimit(0);
        _reg(CALL1);
        _pay(CALL1, priya, 1000e6); // credit-paid call fee
        uint256 w0 = bal(wallet);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));
        assertEq(hisaab.creditOnlyFund(CALLER), 6e6, "credit-only unlimited");
        assertEq(hisaab.earnedFund(CALLER), 0);
        assertEq(bal(wallet), w0, "credit-only is never paid out");
    }

    function test_FundLimit_MixedFeeSplitsAcrossTheTwoParts() public {
        _giveCredit(priya, 2e6);
        hisaab.setLimit(0);
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        uint256 w0 = bal(wallet);
        _settle(CALL1, RIGHT, 0, _arr1(true, 3_490_000, 0));
        assertEq(hisaab.creditOnlyFund(CALLER), 2e6);
        assertEq(hisaab.earnedFund(CALLER), 0);
        assertEq(bal(wallet) - w0, 1_490_000, "cut + whole earned part overflows");
    }

    // ------------------------------------------------------------ settler bounds
    function test_Settle_OnlySettler() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 0, 0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedSettler.selector, stranger, settler));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedSettler.selector, owner, settler));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.prank(writer);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedSettler.selector, writer, settler));
        hisaab.startSettlement(CALL1);
    }

    function test_Settle_KeptFeeAboveCallFeeReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 6e6 + 1, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0)); // equal to the call fee is fine
    }

    function test_Settle_KeptFeeOnUnfilledCopyReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(false, 1, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
        hisaab.settleBatch(CALL1, ABOVE, 0, rs);
    }

    function test_Settle_CreditAskOnRightOrRefundReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 0, 1);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
        hisaab.settleBatch(CALL1, REFUND, 0, rs);
    }

    function test_Settle_KeptFeeOnRefundReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 1, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
        hisaab.settleBatch(CALL1, REFUND, 0, rs);
    }

    function test_Settle_TotalAskOnNonWrongReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Result[] memory rs = _arr1(true, 0, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidTotalAsk.selector, CALL1, 0, 5));
        hisaab.settleBatch(CALL1, RIGHT, 5, rs);
    }

    function test_Settle_BatchIsAtomic() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1000e6, 3);
        uint256 h0 = bal(address(hisaab));
        Hisaab.Result[] memory rs = new Hisaab.Result[](3);
        rs[0] = _res(true, 6e6, 0);
        rs[1] = _res(false, 0, 0);
        rs[2] = _res(true, 6e6 + 1, 0); // invalid
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 2));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(c.cursor, 0);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Open), "start of settlement reverted too");
        assertFalse(c.endingSet);
        assertEq(bal(address(hisaab)), h0);
        assertEq(hisaab.earnedFund(CALLER), 0);
    }

    function test_Settle_InvalidBatchSizes() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 2);
        vm.startPrank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 0, 2));
        hisaab.settleBatch(CALL1, RIGHT, 0, new Hisaab.Result[](0));
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 3, 2));
        hisaab.settleBatch(CALL1, RIGHT, 0, _uniform(3, true, 0, 0));
        vm.stopPrank();
    }

    function test_Settle_EmptyBatchCompletesCallWithNoCopies() public {
        _reg(CALL1);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 0, 0, REFUND);
        _settle(CALL1, REFUND, 0, new Hisaab.Result[](0));
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done));
    }

    function test_Settle_LaterBatchMustRepeatEnding() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1000e6, 3);
        _settle(CALL1, RIGHT, 0, _uniform(1, true, 0, 0));
        Hisaab.Result[] memory rs = _uniform(1, false, 0, 0);
        vm.startPrank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InconsistentEnding.selector, CALL1));
        hisaab.settleBatch(CALL1, REFUND, 0, rs);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InconsistentEnding.selector, CALL1));
        hisaab.settleBatch(CALL1, ABOVE, 0, rs);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InconsistentEnding.selector, CALL1));
        hisaab.settleBatch(CALL1, RIGHT, 7, rs);
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.stopPrank();
    }

    function test_Settle_AfterDoneReverts() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, RIGHT, 0, _arr1(true, 0, 0));
        Hisaab.Result[] memory rs = _arr1(true, 0, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.startSettlement(CALL1);
    }

    function test_Settle_UnknownCallReverts() public {
        Hisaab.Result[] memory rs = _arr1(true, 0, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, CALL2));
        hisaab.settleBatch(CALL2, RIGHT, 0, rs);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, CALL2));
        hisaab.startSettlement(CALL2);
    }

    function test_StartSettlement_StopsCopyingAndEmits() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        vm.expectEmit(true, false, false, false, address(hisaab));
        emit Hisaab.SettlementStarted(CALL1);
        vm.prank(settler);
        hisaab.startSettlement(CALL1);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Settling));
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.startSettlement(CALL1);
        // settlement can still proceed from Settling
        _settle(CALL1, RIGHT, 0, _arr1(false, 0, 0));
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }

    // ------------------------------------------------------------ fuzz
    function testFuzz_Right_AndAbove_PayoutConservation(uint256 size, uint256 keptSeed, uint16 share, bool above, bool filled)
        public
    {
        size = bound(size, 1e6, 1e10);
        share = uint16(bound(share, 1000, 7000));
        _regShare(CALL1, share);
        _pay(CALL1, alice, size);
        uint256 callFee = _callFee(size);
        uint256 kept = filled ? bound(keptSeed, 0, callFee) : 0;
        uint256 pf = _platformFee(size);
        uint256 a0 = bal(alice);
        uint256 w0 = bal(wallet);
        uint256 t0 = bal(treasury);

        _settle(CALL1, above ? ABOVE : RIGHT, 0, _arr1(filled, kept, 0));

        uint256 cut = (kept * share) / (above ? 20_000 : 10_000);
        assertEq(bal(wallet) - w0, cut, "cut rounds down");
        assertEq(hisaab.earnedFund(CALLER), kept - cut, "remainder to fund");
        assertEq(bal(treasury) - t0, filled ? pf : 0, "platform fee only if filled");
        assertEq(bal(alice) - a0, callFee + pf - kept - (filled ? pf : 0), "follower gets the rest");
        // everything pulled is accounted for
        assertEq(
            (bal(wallet) - w0) + hisaab.earnedFund(CALLER) + (bal(treasury) - t0) + (bal(alice) - a0),
            callFee + pf
        );
        assertEq(bal(address(hisaab)), hisaab.earnedFund(CALLER) + hisaab.creditReserve());
    }
}
