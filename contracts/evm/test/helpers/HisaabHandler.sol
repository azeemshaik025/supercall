// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Hisaab} from "../../src/Hisaab.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @dev Invariant handler. Drives bounded random registrations, payments, settlements, expiries,
/// blocklist toggles and claims. Every call into Hisaab is wrapped in try/catch so rejected
/// actions simply do nothing.
contract HisaabHandler is Test {
    Hisaab internal hisaab;
    MockUSDC internal usdc;
    address internal permit2;
    address internal settler;
    address internal writer;
    address internal treasury;

    bytes32[4] internal ids;
    bytes32[2] internal callers;
    address[4] internal followers;
    uint256[4] internal pks;
    address[3] internal wallets;
    bool[4] internal registered;
    uint256 internal nonce;
    uint256 public payOk;
    uint256 public settleOk;
    uint256 public wrongOk;
    uint256 public expireOk;
    uint256 public claimOk;
    uint256 public owedBooked;

    constructor(
        Hisaab h, MockUSDC u, address p2, address settler_, address writer_, address treasury_,
        address[4] memory followers_, uint256[4] memory pks_, address[3] memory wallets_
    ) {
        hisaab = h;
        usdc = u;
        permit2 = p2;
        settler = settler_;
        writer = writer_;
        treasury = treasury_;
        followers = followers_;
        pks = pks_;
        wallets = wallets_;
        for (uint256 i; i < 4; ++i) {
            ids[i] = keccak256(abi.encode("hcall", i));
        }
        callers[0] = keccak256("hcaller0");
        callers[1] = keccak256("hcaller1");
    }

    /// @dev Starting state for the fuzzer: all four calls registered, three copies each.
    function seed() external {
        for (uint256 i; i < 4; ++i) {
            vm.prank(writer);
            hisaab.registerCall(
                ids[i], keccak256(abi.encode("fp", i)), callers[i % 2], wallets[i % 3],
                uint16(2000 + 1000 * i), uint64(block.timestamp + 2 days + i * 1 days)
            );
            registered[i] = true;
            for (uint256 j; j < 3; ++j) {
                _seedPay(i, (i + j) % 4, (10 + 5 * j) * 1e6 * (i + 1));
            }
        }
    }

    function _seedPay(uint256 i, uint256 fi, uint256 size) internal {
        uint256 amount = (size * 70) / 10_000;
        uint256 n = nonce++;
        uint256 dl = block.timestamp + 100 days;
        bytes memory sig = _sig(pks[fi], ids[i], size, amount, n, dl);
        hisaab.payFee(ids[i], followers[fi], size, n, dl, sig);
    }

    // ------------------------------------------------------------ actions
    function register(uint256 i, uint256 shareSeed, uint256 dlSeed, uint256 walletSeed) external {
        i %= 4;
        if (registered[i]) return;
        uint64 dl = uint64(block.timestamp + bound(dlSeed, 1 hours, 30 days));
        uint16 share = uint16(bound(shareSeed, 1000, 7000));
        vm.prank(writer);
        try hisaab.registerCall(ids[i], keccak256(abi.encode("fp", i)), callers[i % 2], wallets[walletSeed % 3], share, dl) {
            registered[i] = true;
        } catch {}
    }

    function pay(uint256 i, uint256 fSeed, uint256 sizeSeed) external {
        i %= 4;
        if (!registered[i]) return;
        uint256 fi = fSeed % 4;
        uint256 size = bound(sizeSeed, 1e6, 1e9);
        uint256 amount = (size * 60) / 10_000 + (size * 10) / 10_000;
        uint256 n = nonce++;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pks[fi], ids[i], size, amount, n, dl);
        try hisaab.payFee(ids[i], followers[fi], size, n, dl, sig) {
            ++payOk;
        } catch {}
    }

    function startSettle(uint256 i) external {
        i %= 4;
        if (!registered[i]) return;
        vm.prank(settler);
        try hisaab.startSettlement(ids[i]) {} catch {}
    }

    function settle(uint256 i, uint256 endingSeed, uint256 nSeed, uint256 seed) external {
        i %= 4;
        if (!registered[i]) return;
        Hisaab.CallInfo memory info = hisaab.getCall(ids[i]);
        if (info.status == Hisaab.Status.Done || info.expired) return;
        uint256 remaining = info.copyCount - info.cursor;
        Hisaab.Ending ending = info.endingSet ? info.ending : _pickEnding(i, endingSeed);
        uint256 n = remaining == 0 ? 0 : (ending == Hisaab.Ending.Wrong ? remaining : bound(nSeed, 1, remaining));
        if (n > 50) return;
        (Hisaab.Result[] memory rs, uint256 total) = _results(ids[i], info.cursor, n, ending, seed);
        if (ending != Hisaab.Ending.Wrong) total = 0;
        else if (info.endingSet) total = info.totalAsk;
        vm.prank(settler);
        try hisaab.settleBatch(ids[i], ending, total, rs) {
            ++settleOk;
            if (ending == Hisaab.Ending.Wrong && total > 0) ++wrongOk;
        } catch {}
    }

    function expire(uint256 i, uint256 count) external {
        i %= 4;
        if (!registered[i]) return;
        uint256 t = hisaab.getCall(ids[i]).deadline + 7 days;
        if (block.timestamp < t) vm.warp(t);
        try hisaab.continueAsRefund(ids[i], bound(count, 0, 50)) {
            ++expireOk;
        } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 6 hours));
    }

    function setBlocked(uint256 aSeed, bool isBlocked) external {
        usdc.setBlocked(_actor(aSeed), isBlocked);
    }

    function setSoftFail(bool soft) external {
        usdc.setSoftFail(soft);
    }

    function claim(uint256 aSeed) external {
        try hisaab.claim(_actor(aSeed)) {
            ++claimOk;
        } catch {}
    }

    // ------------------------------------------------------------ views for invariants
    function totalLiabilities() external view returns (uint256 total) {
        for (uint256 i; i < 4; ++i) {
            if (!registered[i]) continue;
            Hisaab.CallInfo memory c = hisaab.getCall(ids[i]);
            total += c.escrowCash + c.escrowCredit + hisaab.creditSetAside(ids[i]);
        }
        for (uint256 j; j < 2; ++j) {
            total += hisaab.earnedFund(callers[j]) + hisaab.creditOnlyFund(callers[j]);
        }
        total += hisaab.creditReserve();
        for (uint256 k; k < 8; ++k) {
            total += hisaab.owed(_actor(k));
        }
    }

    function creditLedgerSum() external view returns (uint256 sum) {
        for (uint256 i; i < 4; ++i) {
            sum += hisaab.creditBalance(followers[i]);
        }
    }

    function checkCallsConsistent() external view returns (bool) {
        for (uint256 i; i < 4; ++i) {
            if (!registered[i]) continue;
            Hisaab.CallInfo memory c = hisaab.getCall(ids[i]);
            if (c.cursor > c.copyCount) return false;
            if (c.status == Hisaab.Status.Done && (c.escrowCash != 0 || c.escrowCredit != 0 || c.cursor != c.copyCount)) {
                return false;
            }
            if (c.status == Hisaab.Status.Done && hisaab.creditSetAside(ids[i]) != 0) return false;
        }
        return true;
    }

    function copiesMade() external view returns (uint256 n) {
        for (uint256 i; i < 4; ++i) {
            if (registered[i]) n += hisaab.getCall(ids[i]).copyCount;
        }
    }

    // ------------------------------------------------------------ internals
    /// @dev Calls 0/1 mostly end Right (they build the funds), calls 2/3 mostly end Wrong (they draw on them).
    function _pickEnding(uint256 i, uint256 seed) internal pure returns (Hisaab.Ending) {
        uint256 r = seed % 4;
        if (i < 2) return r < 2 ? Hisaab.Ending.Right : (r == 2 ? Hisaab.Ending.AboveEntry : Hisaab.Ending.Refund);
        return r < 3 ? Hisaab.Ending.Wrong : Hisaab.Ending.Right;
    }

    function _actor(uint256 a) internal view returns (address) {
        a %= 8;
        if (a < 4) return followers[a];
        if (a < 7) return wallets[a - 4];
        return treasury;
    }

    function _results(bytes32 id, uint256 from, uint256 n, Hisaab.Ending ending, uint256 seed)
        internal
        view
        returns (Hisaab.Result[] memory rs, uint256 total)
    {
        rs = new Hisaab.Result[](n);
        for (uint256 k; k < n; ++k) {
            Hisaab.CopyInfo memory cp = hisaab.getCopy(id, from + k);
            uint256 callFee = cp.callFeeCash + cp.callFeeCredit;
            uint256 r = uint256(keccak256(abi.encode(seed, k)));
            if (ending == Hisaab.Ending.Right || ending == Hisaab.Ending.AboveEntry) {
                bool filled = r % 4 != 0;
                rs[k] = Hisaab.Result(filled, filled ? (r >> 8) % (callFee + 1) : 0, 0, bytes32(r | 1));
            } else if (ending == Hisaab.Ending.Wrong) {
                uint256 maxAsk = (cp.size * 3000) / 10_000 - callFee;
                uint256 ask = (r >> 8) % (maxAsk + 1);
                rs[k] = Hisaab.Result(true, 0, ask, bytes32(r | 1));
                total += ask;
            } else {
                rs[k] = Hisaab.Result(r % 2 == 0, 0, 0, r % 3 == 0 ? bytes32(0) : bytes32(r | 1));
            }
        }
    }

    function _sig(uint256 pk, bytes32 id, uint256 size, uint256 amount, uint256 n, uint256 dl)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(id, size, amount, n, dl));
        return abi.encodePacked(r, s, v);
    }

    function _digest(bytes32 id, uint256 size, uint256 amount, uint256 n, uint256 dl)
        internal
        view
        returns (bytes32)
    {
        bytes32 witness = keccak256(abi.encode(keccak256("CallFee(bytes32 call,uint256 size)"), id, size));
        bytes32 tp = keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), address(usdc), amount));
        bytes32 typehash = keccak256(
            "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,CallFee witness)CallFee(bytes32 call,uint256 size)TokenPermissions(address token,uint256 amount)"
        );
        bytes32 structHash = keccak256(abi.encode(typehash, tp, address(hisaab), n, dl, witness));
        return keccak256(abi.encodePacked("\x19\x01", IPermit2(permit2).DOMAIN_SEPARATOR(), structHash));
    }
}
