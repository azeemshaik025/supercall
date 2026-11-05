// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Hisaab} from "../src/Hisaab.sol";
import {HisaabHarness} from "./helpers/HisaabHarness.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// Deployment, registration, roles, pause and ownership.
contract HisaabAdminTest is HisaabBase {
    function _dl() internal view returns (uint64) {
        return uint64(block.timestamp + 30 days);
    }

    // ------------------------------------------------------------ constructor
    function test_Constructor_SetsState() public view {
        assertEq(address(hisaab.usdc()), address(usdc));
        assertEq(address(hisaab.permit2()), permit2);
        assertEq(hisaab.treasury(), treasury);
        assertEq(hisaab.writer(), writer);
        assertEq(hisaab.settler(), settler);
        assertEq(hisaab.owner(), owner);
        assertEq(hisaab.MIN_SIZE(), 1_000_000);
    }

    function test_Constructor_RevertsOnZeroAddresses() public {
        address u = address(usdc);
        address z = address(0);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        new HisaabHarness(z, permit2, owner, writer, settler, treasury);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        new HisaabHarness(u, z, owner, writer, settler, treasury);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        new HisaabHarness(u, permit2, owner, z, settler, treasury);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        new HisaabHarness(u, permit2, owner, writer, z, treasury);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        new HisaabHarness(u, permit2, owner, writer, settler, z);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, z));
        new HisaabHarness(u, permit2, z, writer, settler, treasury);
    }

    // ------------------------------------------------------------ registerCall
    function test_Register_StoresCallAndEmits() public {
        uint64 dl = _dl();
        bytes32 fp = keccak256("record");
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CallRegistered(CALL1, fp, CALLER, wallet, 5010, dl);
        vm.prank(writer);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5010, dl);

        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(c.fingerprint, fp);
        assertEq(c.caller, CALLER);
        assertEq(c.wallet, wallet);
        assertEq(c.shareBps, 5010);
        assertEq(c.deadline, dl);
        assertEq(uint8(c.status), uint8(Hisaab.Status.Open));
        assertEq(c.copyCount, 0);
        assertEq(c.cursor, 0);
    }

    function test_Register_FingerprintCheck() public {
        bytes32 fp = keccak256("record");
        vm.prank(writer);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, _dl());
        assertTrue(hisaab.checkFingerprint(CALL1, fp));
        assertFalse(hisaab.checkFingerprint(CALL1, keccak256("other")));
        assertFalse(hisaab.checkFingerprint(CALL2, fp));
        assertFalse(hisaab.checkFingerprint(CALL2, bytes32(0)));
    }

    function test_Register_OnlyWriter() public {
        bytes32 fp = keccak256("r");
        uint64 dl = _dl();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedWriter.selector, stranger, writer));
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, dl);
        // owner and settler are not the writer either
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedWriter.selector, owner, writer));
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, dl);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedWriter.selector, settler, writer));
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, dl);
    }

    function test_Register_RejectsReusedCallId() public {
        _reg(CALL1);
        uint64 dl = _dl();
        vm.prank(writer);
        vm.expectRevert(Hisaab.CallAlreadyRegistered.selector);
        hisaab.registerCall(CALL1, keccak256("x"), CALLER, wallet, 5000, dl);
    }

    function test_Register_ShareBpsBounds() public {
        uint64 dl = _dl();
        bytes32 fp = keccak256("r");
        vm.startPrank(writer);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 999, dl);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 7001, dl);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 0, dl);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 1000, dl);
        hisaab.registerCall(CALL2, fp, CALLER, wallet, 7000, dl);
        vm.stopPrank();
    }

    function testFuzz_Register_ShareBps(uint16 share) public {
        bool ok = share >= 1000 && share <= 7000;
        vm.prank(writer);
        if (!ok) vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, keccak256("r"), CALLER, wallet, share, _dl());
    }

    function test_Register_DeadlineMustBeFuture() public {
        bytes32 fp = keccak256("r");
        vm.startPrank(writer);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, uint64(block.timestamp));
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, uint64(block.timestamp - 1));
        hisaab.registerCall(CALL1, fp, CALLER, wallet, 5000, uint64(block.timestamp + 1));
        vm.stopPrank();
    }

    function test_Register_DeadlineMonthsAwayAccepted() public {
        vm.prank(writer);
        hisaab.registerCall(CALL1, keccak256("r"), CALLER, wallet, 5000, uint64(block.timestamp + 400 days));
        assertEq(_deadlineOf(CALL1), block.timestamp + 400 days);
    }

    function test_Register_RejectsZeroFields() public {
        uint64 dl = _dl();
        bytes32 fp = keccak256("r");
        vm.startPrank(writer);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, bytes32(0), CALLER, wallet, 5000, dl);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, bytes32(0), wallet, 5000, dl);
        vm.expectRevert(Hisaab.InvalidRegistration.selector);
        hisaab.registerCall(CALL1, fp, CALLER, address(0), 5000, dl);
        vm.stopPrank();
    }

    function test_Register_RevertsWhenPaused() public {
        vm.prank(owner);
        hisaab.pause();
        uint64 dl = _dl();
        vm.prank(writer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hisaab.registerCall(CALL1, keccak256("r"), CALLER, wallet, 5000, dl);
    }

    function test_UnknownCallReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, CALL1));
        hisaab.getCall(CALL1);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, CALL1));
        hisaab.cursor(CALL1);
    }

    // ------------------------------------------------------------ roles
    function test_ReplaceWriter_OwnerOnly() public {
        address newWriter = makeAddr("newWriter");
        vm.expectEmit(true, true, false, false, address(hisaab));
        emit Hisaab.WriterReplaced(writer, newWriter);
        vm.prank(owner);
        hisaab.replaceWriter(newWriter);
        assertEq(hisaab.writer(), newWriter);

        // the old writer is locked out, the new one works
        uint64 dl = _dl();
        vm.prank(writer);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedWriter.selector, writer, newWriter));
        hisaab.registerCall(CALL1, keccak256("r"), CALLER, wallet, 5000, dl);
        vm.prank(newWriter);
        hisaab.registerCall(CALL1, keccak256("r"), CALLER, wallet, 5000, dl);
    }

    function test_ReplaceWriter_RevertsForNonOwnerAndZero() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.replaceWriter(stranger);
        vm.prank(writer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, writer));
        hisaab.replaceWriter(stranger);
        vm.prank(owner);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        hisaab.replaceWriter(address(0));
    }

    function test_ReplaceWriter_DoesNotChangeRegisteredCalls() public {
        _reg(CALL1);
        Hisaab.CallInfo memory before_ = hisaab.getCall(CALL1);
        vm.prank(owner);
        hisaab.replaceWriter(makeAddr("newWriter"));
        Hisaab.CallInfo memory after_ = hisaab.getCall(CALL1);
        assertEq(after_.wallet, before_.wallet);
        assertEq(after_.fingerprint, before_.fingerprint);
        assertEq(after_.shareBps, before_.shareBps);
        // copying still works under the old registration
        _pay(CALL1, alice, 100e6);
    }

    function test_ReplaceSettler_OwnerOnly() public {
        address newSettler = makeAddr("newSettler");
        _reg(CALL1);
        vm.expectEmit(true, true, false, false, address(hisaab));
        emit Hisaab.SettlerReplaced(settler, newSettler);
        vm.prank(owner);
        hisaab.replaceSettler(newSettler);
        assertEq(hisaab.settler(), newSettler);

        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.UnauthorizedSettler.selector, settler, newSettler));
        hisaab.startSettlement(CALL1);
        vm.prank(newSettler);
        hisaab.startSettlement(CALL1);
    }

    function test_ReplaceSettler_RevertsForNonOwnerAndZero() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.replaceSettler(stranger);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, settler));
        hisaab.replaceSettler(stranger);
        vm.prank(owner);
        vm.expectRevert(Hisaab.ZeroAddress.selector);
        hisaab.replaceSettler(address(0));
    }

    // ------------------------------------------------------------ pause
    function test_Pause_OwnerOnly() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.pause();

        vm.prank(owner);
        hisaab.pause();
        assertTrue(hisaab.paused());

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.unpause();

        vm.prank(owner);
        hisaab.unpause();
        assertFalse(hisaab.paused());
    }

    // ------------------------------------------------------------ ownership
    function test_Ownership_TwoStepHandover() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        hisaab.transferOwnership(newOwner);
        // proposing alone changes nothing
        assertEq(hisaab.owner(), owner);
        assertEq(hisaab.pendingOwner(), newOwner);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.acceptOwnership();

        vm.expectEmit(true, true, false, false, address(hisaab));
        emit Ownable.OwnershipTransferred(owner, newOwner);
        vm.prank(newOwner);
        hisaab.acceptOwnership();
        assertEq(hisaab.owner(), newOwner);
        assertEq(hisaab.pendingOwner(), address(0));

        // old owner lost the powers, new owner has them
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        hisaab.pause();
        vm.prank(newOwner);
        hisaab.pause();
    }

    function test_Ownership_ProposalOnlyByOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.transferOwnership(stranger);
    }

    function test_Ownership_RenounceDisabled() public {
        vm.prank(owner);
        vm.expectRevert(Hisaab.RenounceDisabled.selector);
        hisaab.renounceOwnership();
        assertEq(hisaab.owner(), owner);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hisaab.renounceOwnership();
    }

    function test_Treasury_ImmutableNoSetter() public {
        // no setter selector exists on the contract
        (bool ok,) = address(hisaab).call(abi.encodeWithSignature("setTreasury(address)", stranger));
        assertFalse(ok);
        (ok,) = address(hisaab).call(abi.encodeWithSignature("replaceTreasury(address)", stranger));
        assertFalse(ok);
        // a full ownership change leaves the treasury untouched
        vm.prank(owner);
        hisaab.transferOwnership(stranger);
        vm.prank(stranger);
        hisaab.acceptOwnership();
        assertEq(hisaab.treasury(), treasury);
    }

    function test_NoFundWithdrawalOrCreditTransferEntryPoints() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, Hisaab.Ending.Right, 0, _arr1(true, 6e6, 0));
        bytes[6] memory calls = [
            abi.encodeWithSignature("withdraw(bytes32)", CALLER),
            abi.encodeWithSignature("withdrawFund(bytes32,uint256)", CALLER, 1),
            abi.encodeWithSignature("transferCredit(address,uint256)", bob, 1),
            abi.encodeWithSignature("withdrawCredit(uint256)", 1),
            abi.encodeWithSignature("redeemCredit(uint256)", 1),
            abi.encodeWithSignature("copy(bytes32,uint256)", CALL1, 1e6)
        ];
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(owner);
            (bool ok,) = address(hisaab).call(calls[i]);
            assertFalse(ok);
        }
        assertEq(hisaab.earnedFund(CALLER), 3e6);
        // the only way anything leaves is an owed claim, and none exists for the fund holder
        vm.expectRevert(abi.encodeWithSelector(Hisaab.NothingOwed.selector, wallet));
        hisaab.claim(wallet);
    }
}
