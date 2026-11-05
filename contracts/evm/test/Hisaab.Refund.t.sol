// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Hisaab} from "../src/Hisaab.sol";
import {MockUSDC} from "./helpers/MockUSDC.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Refused payouts and claim, plus continueAsRefund (expiry).
contract HisaabRefundTest is HisaabBase {
    Hisaab.Ending internal constant RIGHT = Hisaab.Ending.Right;
    Hisaab.Ending internal constant WRONG = Hisaab.Ending.Wrong;
    Hisaab.Ending internal constant REFUND = Hisaab.Ending.Refund;

    // ============================================================ refused payouts
    function test_Refused_BlockedFollowerBookedAsOwedBatchCompletes() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        uint256 b0 = bal(bob);
        usdc.setBlocked(alice, true);

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.PayoutOwed(alice, 7e6);
        _settle(CALL1, REFUND, 0, _uniform(2, false, 0, 0));

        assertEq(hisaab.owed(alice), 7e6);
        assertEq(hisaab.owed(bob), 0);
        assertEq(bal(bob) - b0, 7e6, "other followers still paid");
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
        assertEq(hisaab.getCall(CALL1).escrowCash, 0);
    }

    function test_Claim_PaysOnlyTheRecipientAndSecondRefusalRevertsKeepingOwed() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        usdc.setBlocked(alice, true);
        usdc.setBlocked(bob, true);
        _settle(CALL1, REFUND, 0, _uniform(2, false, 0, 0));
        assertEq(hisaab.owed(alice), 7e6);
        assertEq(hisaab.owed(bob), 7e6);

        // refused again: reverts, amount stays owed
        vm.prank(stranger);
        vm.expectRevert();
        hisaab.claim(alice);
        assertEq(hisaab.owed(alice), 7e6);

        usdc.setBlocked(alice, false);
        uint256 a0 = bal(alice);
        uint256 s0 = bal(stranger);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.Claimed(alice, 7e6);
        vm.prank(stranger);
        hisaab.claim(alice);
        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(stranger), s0, "caller of claim gets nothing");
        assertEq(hisaab.owed(alice), 0);
        assertEq(hisaab.owed(bob), 7e6, "other debts untouched");

        vm.expectRevert(abi.encodeWithSelector(Hisaab.NothingOwed.selector, alice));
        hisaab.claim(alice);
    }

    function test_Claim_NothingOwedReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Hisaab.NothingOwed.selector, stranger));
        hisaab.claim(stranger);
    }

    function test_Refused_SoftFailTokenReturningFalseIsBookedAsOwed() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        usdc.setSoftFail(true);
        usdc.setBlocked(alice, true);
        _settle(CALL1, REFUND, 0, _arr1(false, 0, 0));
        assertEq(hisaab.owed(alice), 7e6);

        // claim while still refused: safeTransfer sees `false`, reverts, debt stays
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(usdc)));
        hisaab.claim(alice);
        assertEq(hisaab.owed(alice), 7e6);

        usdc.setBlocked(alice, false);
        uint256 a0 = bal(alice);
        hisaab.claim(alice);
        assertEq(bal(alice) - a0, 7e6);
    }

    function test_Refused_BlockedPayoutWallet() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        usdc.setBlocked(wallet, true);
        uint256 t0 = bal(treasury);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0));

        assertEq(hisaab.owed(wallet), 3_006_000, "cut booked");
        assertEq(hisaab.earnedFund(CALLER), 2_994_000, "fund still credited");
        assertEq(bal(treasury) - t0, 1e6, "treasury still paid");
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));

        usdc.setBlocked(wallet, false);
        uint256 w0 = bal(wallet);
        hisaab.claim(wallet);
        assertEq(bal(wallet) - w0, 3_006_000);
    }

    function test_Refused_BlockedTreasury() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        _pay(CALL1, alice, 1000e6);
        usdc.setBlocked(treasury, true);
        uint256 w0 = bal(wallet);
        _settle(CALL1, RIGHT, 0, _uniform(2, true, 6e6, 0));
        assertEq(hisaab.owed(treasury), 2e6, "both platform fees booked in one amount");
        assertEq(bal(wallet) - w0, 2 * 3_006_000, "wallet still paid");

        usdc.setBlocked(treasury, false);
        uint256 t0 = bal(treasury);
        vm.prank(stranger);
        hisaab.claim(treasury);
        assertEq(bal(treasury) - t0, 2e6);
    }

    function test_Refused_OwedAccumulatesAcrossCalls() public {
        _reg(CALL1);
        _reg(CALL2);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL2, alice, 500e6);
        usdc.setBlocked(alice, true);
        _settle(CALL1, REFUND, 0, _arr1(false, 0, 0));
        _settle(CALL2, REFUND, 0, _arr1(false, 0, 0));
        assertEq(hisaab.owed(alice), 7e6 + 3.5e6);
        usdc.setBlocked(alice, false);
        uint256 a0 = bal(alice);
        hisaab.claim(alice);
        assertEq(bal(alice) - a0, 10.5e6);
    }

    function test_Refused_ZeroAmountIsNotBooked() public {
        _regShare(CALL1, 5010);
        _pay(CALL1, priya, 1000e6);
        usdc.setBlocked(priya, true);
        _settle(CALL1, RIGHT, 0, _arr1(true, 6e6, 0)); // nothing owed back to Priya
        assertEq(hisaab.owed(priya), 0);
    }

    function test_Claim_NotBlockedByPause() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        usdc.setBlocked(alice, true);
        _settle(CALL1, REFUND, 0, _arr1(false, 0, 0));
        usdc.setBlocked(alice, false);
        vm.prank(owner);
        hisaab.pause();
        hisaab.claim(alice);
        assertEq(hisaab.owed(alice), 0);
    }

    // ============================================================ continueAsRefund
    function test_Expiry_RejectedBeforeSevenDaysAfterDeadline() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        uint256 d = _deadlineOf(CALL1);
        vm.warp(d + 7 days - 1);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.TooEarly.selector, d + 7 days));
        hisaab.continueAsRefund(CALL1, 50);
        vm.warp(d);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.TooEarly.selector, d + 7 days));
        hisaab.continueAsRefund(CALL1, 50);
        vm.warp(d + 7 days);
        hisaab.continueAsRefund(CALL1, 50);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }

    function test_Expiry_AnyoneRefundsInFormPaid() public {
        _giveCredit(priya, 2e6);
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, priya, 1000e6); // 2e6 credit + 4e6 cash + 1e6 platform
        uint256 a0 = bal(alice);
        uint256 p0 = bal(priya);
        uint256 t0 = bal(treasury);
        uint256 w0 = bal(wallet);
        vm.warp(_deadlineOf(CALL1) + 7 days);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.Expired(CALL1, 0);
        vm.prank(stranger);
        hisaab.continueAsRefund(CALL1, 50);

        assertEq(bal(alice) - a0, 7e6);
        assertEq(bal(priya) - p0, 5e6);
        assertEq(hisaab.creditBalance(priya), 2e6, "credit-paid part comes back as credit");
        assertEq(bal(treasury), t0);
        assertEq(bal(wallet), w0);
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertTrue(c.expired);
        assertEq(c.escrowCash, 0);
        assertEq(c.escrowCredit, 0);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done));
        assertEq(c.cursor, 2);
    }

    function test_Expiry_SettleBatchRevertsAfterwards_EvenIfNotDone() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1000e6, 3);
        vm.warp(_deadlineOf(CALL1) + 7 days);
        hisaab.continueAsRefund(CALL1, 1); // partial: 2 copies left
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Settling));
        Hisaab.Result[] memory rs = _arr1(true, 6e6, 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.startSettlement(CALL1);
    }

    function test_Expiry_PartialSettlementThenExpiry() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1000e6, 5);
        _settle(CALL1, RIGHT, 0, _uniform(2, true, 6e6, 0)); // two copies keep their Right result
        assertEq(hisaab.cursor(CALL1), 2);
        uint256 a0 = bal(alice);
        uint256 t0 = bal(treasury);
        uint256 w0 = bal(wallet);

        _expire(CALL1, 50);

        assertEq(bal(alice) - a0, 3 * 7e6, "remaining three refunded in full");
        assertEq(bal(treasury), t0, "no more platform fees");
        assertEq(bal(wallet), w0);
        assertEq(hisaab.earnedFund(CALLER), 2 * 3e6, "settled copies stay settled");
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(uint8(c.ending), uint8(Hisaab.Ending.Right), "posted ending kept as history");
        assertTrue(c.expired);
        assertEq(c.escrowCash, 0);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Done));
    }

    function test_Expiry_InChunksOfAtMostFifty() public {
        _reg(CALL1);
        _payMany(CALL1, alice, 1e6, 60);
        vm.warp(_deadlineOf(CALL1) + 7 days);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 51, 60));
        hisaab.continueAsRefund(CALL1, 51);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidBatch.selector, CALL1, 0, 60));
        hisaab.continueAsRefund(CALL1, 0);

        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.BatchSettled(CALL1, 0, 50, REFUND);
        hisaab.continueAsRefund(CALL1, 50);
        assertEq(hisaab.cursor(CALL1), 50);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Settling));
        hisaab.continueAsRefund(CALL1, 50); // more than remains: only the last 10
        assertEq(hisaab.cursor(CALL1), 60);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }

    function test_Expiry_EmptyCallAndDoneCall() public {
        _reg(CALL1);
        _reg(CALL2);
        vm.warp(_deadlineOf(CALL1) + 7 days);
        hisaab.continueAsRefund(CALL1, 0);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL1));
        hisaab.continueAsRefund(CALL1, 0);

        // a call the settler already finished cannot be expired either
        _settle(CALL2, RIGHT, 0, new Hisaab.Result[](0));
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SettlementClosed.selector, CALL2));
        hisaab.continueAsRefund(CALL2, 0);

        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, keccak256("nope")));
        hisaab.continueAsRefund(keccak256("nope"), 1);
    }

    function test_Expiry_NotBlockedByPause_AndBlockedFollowerBookedAsOwed() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        usdc.setBlocked(alice, true);
        vm.prank(owner);
        hisaab.pause();
        _expire(CALL1, 50);
        assertEq(hisaab.owed(alice), 7e6);
        assertEq(hisaab.owed(bob), 0);
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
    }

    // ------------------------------------------------------------ returned set-aside credit
    function test_Expiry_UnhandedCreditReturnsToEarned() public {
        _buildFund(); // earned 70, credit-only 30
        bytes32 e = _newId();
        _reg(e);
        _pay(e, alice, 1000e6);
        _pay(e, bob, 1000e6);
        _settle(e, WRONG, 80e6, _arr1(true, 0, 48e6)); // alice gets 30e6; bob's 20e6 stays set aside
        assertEq(hisaab.creditSetAside(e), 20e6);
        assertEq(hisaab.earnedFund(CALLER), 50e6);
        uint256 b0 = bal(bob);

        vm.warp(_deadlineOf(e) + 7 days);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CreditReturned(e, 0, 20e6);
        hisaab.continueAsRefund(e, 50);

        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 0);
        assertEq(hisaab.creditSetAside(e), 0);
        assertEq(hisaab.creditBalance(alice), 30e6, "settled copy keeps its credit");
        assertEq(hisaab.creditBalance(bob), 0, "refunded copy gets no new credit");
        assertEq(bal(bob) - b0, 7e6);
    }

    function test_Expiry_UnhandedCreditSplitsBackToCreditOnlyThenEarned() public {
        _buildFund();
        bytes32 e = _newId();
        _reg(e);
        _pay(e, alice, 1000e6);
        _pay(e, bob, 1000e6);
        // credit drawn 30 (credit-only) + 20 (earned); alice's 16/80 share = 10e6
        _settle(e, WRONG, 80e6, _arr1(true, 0, 16e6));
        assertEq(hisaab.creditBalance(alice), 10e6);
        assertEq(hisaab.creditSetAside(e), 40e6);

        vm.warp(_deadlineOf(e) + 7 days);
        vm.expectEmit(true, false, false, true, address(hisaab));
        emit Hisaab.CreditReturned(e, 20e6, 20e6);
        hisaab.continueAsRefund(e, 50);

        // handed-out credit consumed the credit-only slice first
        assertEq(hisaab.creditOnlyFund(CALLER), 20e6);
        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditSetAside(e), 0);
        assertEq(
            hisaab.earnedFund(CALLER) + hisaab.creditOnlyFund(CALLER) + hisaab.creditBalance(alice), 100e6,
            "the original $100 is fully accounted for"
        );
    }

    function test_Expiry_ReturnHappensOnlyOnce() public {
        _buildFund();
        bytes32 e = _newId();
        _reg(e);
        _payMany(e, alice, 1e6, 60);
        _settle(e, WRONG, 200_000, _uniform(1, true, 0, 100_000)); // 100_000 stays set aside
        vm.warp(_deadlineOf(e) + 7 days);
        hisaab.continueAsRefund(e, 30);
        uint256 earned = hisaab.earnedFund(CALLER);
        uint256 cOnly = hisaab.creditOnlyFund(CALLER);
        assertEq(cOnly, 30e6 - 100_000, "100_000 handed out of the credit-only slice");
        assertEq(earned, 70e6);
        hisaab.continueAsRefund(e, 30);
        assertEq(hisaab.earnedFund(CALLER), earned);
        assertEq(hisaab.creditOnlyFund(CALLER), cOnly);
    }
}
