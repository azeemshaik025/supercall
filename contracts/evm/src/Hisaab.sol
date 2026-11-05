// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";

/// @notice USDC fee escrow, caller funds, and non-withdrawable follower credit.
/// @dev Call terms and trade results are off-chain. The writer and settler are trusted.
/// @dev All escrowed USDC, both caller funds (earned and credit-only), the credit reserve,
/// and owed balances sit at the Hisaab address. If the USDC issuer blocklists Hisaab itself,
/// no payout or claim can release funds. owed and claim only protect against a blocklisted
/// recipient, not a frozen Hisaab. Operators should monitor the Hisaab address and have
/// the owner pause new fee collection if it is frozen.
contract Hisaab is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant CALL_FEE_BPS = 60;
    uint256 public constant PLATFORM_FEE_BPS = 10;
    uint256 public constant MAX_CREDIT_ASK_BPS = 3_000;
    uint256 public constant MIN_SIZE = 1_000_000;
    uint256 public constant MAX_BATCH_SIZE = 50;
    uint256 public constant REFUND_DELAY = 7 days;
    bytes32 public constant CALL_FEE_TYPEHASH = keccak256("CallFee(bytes32 call,uint256 size)");
    string public constant WITNESS_TYPE_STRING =
        "CallFee witness)CallFee(bytes32 call,uint256 size)TokenPermissions(address token,uint256 amount)";

    enum Status { Open, Settling, Done }
    enum Ending { Right, AboveEntry, Wrong, Refund }

    struct CallInfo {
        bytes32 fingerprint;
        bytes32 caller;
        address wallet;
        uint16 shareBps;
        uint64 deadline;
        Status status;
        Ending ending;
        bool endingSet;
        bool expired;
        bool creditReturned;
        uint256 copyCount;
        uint256 cursor;
        uint256 totalAsk;
        uint256 asksSeen;
        uint256 escrowCash;
        uint256 escrowCredit;
        uint256 creditOnlyDrawn;
        uint256 earnedDrawn;
        uint256 creditHandedOut;
    }

    struct CopyInfo {
        address follower;
        uint256 size;
        uint256 callFeeCash;
        uint256 callFeeCredit;
        uint256 platformFee;
    }

    struct Result {
        bool filled;
        uint256 keptFee;
        uint256 creditAsk;
    }

    struct Payout {
        uint256 cashBack;
        uint256 creditBack;
        uint256 newCredit;
        uint256 walletCash;
        uint256 treasuryCash;
    }

    IERC20 public immutable usdc;
    IPermit2 public immutable permit2;
    address public immutable treasury;
    address public writer;
    address public settler;

    mapping(bytes32 => CallInfo) private _calls;
    mapping(bytes32 => CopyInfo[]) private _copies;
    mapping(bytes32 => uint256) public earnedFund;
    mapping(bytes32 => uint256) public creditOnlyFund;
    mapping(address => uint256) public creditBalance;
    mapping(address => uint256) public owed;
    uint256 public creditReserve;

    error ZeroAddress();
    error InvalidCall(bytes32 call);
    error CallAlreadyRegistered();
    error InvalidRegistration();
    error UnauthorizedWriter(address caller, address expectedWriter);
    error UnauthorizedSettler(address caller, address expectedSettler);
    error CopyingClosed(bytes32 call);
    error InvalidFollower();
    error SizeTooSmall(uint256 size, uint256 minimum);
    error SettlementClosed(bytes32 call);
    error InvalidBatch(bytes32 call, uint256 supplied, uint256 remaining);
    error InconsistentEnding(bytes32 call);
    error InvalidResult(bytes32 call, uint256 index);
    error InvalidTotalAsk(bytes32 call, uint256 expected, uint256 actual);
    error TooEarly(uint256 availableAt);
    error NothingOwed(address to);
    error RenounceDisabled();

    event CallRegistered(
        bytes32 indexed call, bytes32 fingerprint, bytes32 indexed caller,
        address wallet, uint16 shareBps, uint64 deadline
    );
    event Copied(
        bytes32 indexed call, address indexed follower, uint256 index, uint256 size,
        uint256 creditUsed, uint256 cashPulled, address submitter
    );
    event SettlementStarted(bytes32 indexed call);
    /// @dev The interval [from, to) contains the copies settled by this batch.
    event BatchSettled(bytes32 indexed call, uint256 from, uint256 to, Ending ending);
    event CopySettled(
        bytes32 indexed call, uint256 indexed index, address indexed follower,
        uint256 cashBack, uint256 creditBack, uint256 newCredit
    );
    /// @dev Fund balances after the change, not deltas.
    event FundChanged(bytes32 indexed caller, uint256 earned, uint256 creditOnly);
    event CreditSetAside(bytes32 indexed call, uint256 fromCreditOnly, uint256 fromEarned);
    event CreditReturned(bytes32 indexed call, uint256 toCreditOnly, uint256 toEarned);
    event Expired(bytes32 indexed call, uint256 cursor);
    event PayoutOwed(address indexed to, uint256 amount);
    event Claimed(address indexed to, uint256 amount);
    event WriterReplaced(address indexed previousWriter, address indexed newWriter);
    event SettlerReplaced(address indexed previousSettler, address indexed newSettler);

    constructor(
        address usdc_, address permit2_, address owner_,
        address writer_, address settler_, address treasury_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || permit2_ == address(0) || writer_ == address(0)
            || settler_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        permit2 = IPermit2(permit2_);
        treasury = treasury_;
        writer = writer_;
        settler = settler_;
    }

    modifier onlyWriter() {
        if (msg.sender != writer) revert UnauthorizedWriter(msg.sender, writer);
        _;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert UnauthorizedSettler(msg.sender, settler);
        _;
    }

    function pause() public onlyOwner { _pause(); }
    function unpause() public onlyOwner { _unpause(); }

    function renounceOwnership() public override onlyOwner {
        revert RenounceDisabled();
    }

    function replaceWriter(address newWriter) external onlyOwner {
        if (newWriter == address(0)) revert ZeroAddress();
        emit WriterReplaced(writer, newWriter);
        writer = newWriter;
    }

    function replaceSettler(address newSettler) external onlyOwner {
        if (newSettler == address(0)) revert ZeroAddress();
        emit SettlerReplaced(settler, newSettler);
        settler = newSettler;
    }

    function registerCall(
        bytes32 call, bytes32 fingerprint, bytes32 caller,
        address wallet, uint16 shareBps, uint64 deadline
    ) external onlyWriter whenNotPaused {
        if (_calls[call].fingerprint != bytes32(0)) revert CallAlreadyRegistered();
        if (fingerprint == bytes32(0) || caller == bytes32(0) || wallet == address(0)
            || shareBps < 1_000 || shareBps > 7_000 || uint256(deadline) <= block.timestamp) {
            revert InvalidRegistration();
        }
        CallInfo storage info = _calls[call];
        info.fingerprint = fingerprint;
        info.caller = caller;
        info.wallet = wallet;
        info.shareBps = shareBps;
        info.deadline = deadline;
        emit CallRegistered(call, fingerprint, caller, wallet, shareBps, deadline);
    }

    /// @notice Submit a follower's Permit2 witness signature; only the cash portion is pulled.
    function payFee(
        bytes32 call, address follower, uint256 size,
        uint256 nonce, uint256 deadline, bytes calldata signature
    ) external whenNotPaused nonReentrant returns (uint256 index) {
        CallInfo storage info = _existingCall(call);
        if (info.status != Status.Open || block.timestamp >= info.deadline) revert CopyingClosed(call);
        if (follower == address(0) || follower == info.wallet) revert InvalidFollower();
        if (size < MIN_SIZE) revert SizeTooSmall(size, MIN_SIZE);

        CopyInfo memory copy;
        copy.follower = follower;
        copy.size = size;
        uint256 callFee = Math.mulDiv(size, CALL_FEE_BPS, BPS);
        copy.callFeeCredit = Math.min(callFee, creditBalance[follower]);
        copy.callFeeCash = callFee - copy.callFeeCredit;
        copy.platformFee = Math.mulDiv(size, PLATFORM_FEE_BPS, BPS);

        creditBalance[follower] -= copy.callFeeCredit;
        creditReserve -= copy.callFeeCredit;
        info.escrowCredit += copy.callFeeCredit;
        info.escrowCash += copy.callFeeCash + copy.platformFee;
        index = info.copyCount;
        _copies[call].push(copy);
        info.copyCount = index + 1;

        _pullFee(call, copy, nonce, deadline, signature);
        _emitCopied(call, index, copy);
    }

    function _emitCopied(bytes32 call, uint256 index, CopyInfo memory copy) private {
        emit Copied(call, copy.follower, index, copy.size, copy.callFeeCredit,
            copy.callFeeCash + copy.platformFee, msg.sender);
    }

    function _pullFee(
        bytes32 call, CopyInfo memory copy, uint256 nonce,
        uint256 deadline, bytes calldata signature
    ) private {
        IPermit2.PermitTransferFrom memory permit = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({
                token: address(usdc),
                amount: copy.callFeeCash + copy.callFeeCredit + copy.platformFee
            }),
            nonce: nonce,
            deadline: deadline
        });
        IPermit2.SignatureTransferDetails memory details = IPermit2.SignatureTransferDetails({
            to: address(this), requestedAmount: copy.callFeeCash + copy.platformFee
        });
        permit2.permitWitnessTransferFrom(
            permit, details, copy.follower,
            keccak256(abi.encode(CALL_FEE_TYPEHASH, call, copy.size)),
            WITNESS_TYPE_STRING, signature
        );
    }

    function startSettlement(bytes32 callId) external onlySettler nonReentrant {
        CallInfo storage info = _existingCall(callId);
        if (info.expired || info.status != Status.Open) revert SettlementClosed(callId);
        _startSettlement(callId, info);
    }

    /// @notice Settle copies in cursor order. Empty batches are only for calls with no copies.
    function settleBatch(
        bytes32 callId, Ending ending, uint256 totalAsk, Result[] calldata results
    ) external onlySettler nonReentrant {
        CallInfo storage info = _existingCall(callId);
        if (info.expired || info.status == Status.Done) revert SettlementClosed(callId);
        uint256 from = info.cursor;
        uint256 count = results.length;
        if (count > MAX_BATCH_SIZE || count > info.copyCount - from
            || (count == 0 && info.copyCount != 0)) revert InvalidBatch(callId, count, info.copyCount - from);
        if (info.status == Status.Open) _startSettlement(callId, info);
        _lockEnding(callId, info, ending, totalAsk);

        Payout[] memory payouts = new Payout[](count);
        uint256 walletCash;
        uint256 treasuryCash;
        for (uint256 i; i < count; ++i) {
            payouts[i] = _settleCopy(callId, info, from + i, ending, results[i]);
            walletCash += payouts[i].walletCash;
            treasuryCash += payouts[i].treasuryCash;
        }
        info.cursor = from + count;
        if (info.cursor == info.copyCount) {
            if (ending == Ending.Wrong && info.asksSeen != info.totalAsk) revert InvalidTotalAsk(callId, info.totalAsk, info.asksSeen);
            _finish(callId, info);
        }
        emit BatchSettled(callId, from, info.cursor, ending);
        // All accounting and final-batch validation precede transfers.
        _pushFollowers(callId, from, payouts);
        _push(info.wallet, walletCash);
        _push(treasury, treasuryCash);
    }

    function _startSettlement(bytes32 callId, CallInfo storage info) private {
        info.status = Status.Settling;
        emit SettlementStarted(callId);
    }

    function _lockEnding(
        bytes32 callId, CallInfo storage info, Ending ending, uint256 totalAsk
    ) private {
        if (info.endingSet) {
            if (info.ending != ending || info.totalAsk != totalAsk) revert InconsistentEnding(callId);
            return;
        }
        if (ending != Ending.Wrong && totalAsk != 0) revert InvalidTotalAsk(callId, 0, totalAsk);
        info.endingSet = true;
        info.ending = ending;
        info.totalAsk = totalAsk;
        if (ending != Ending.Wrong) return;

        bytes32 caller = info.caller;
        uint256 totalCredit = Math.min(totalAsk, (earnedFund[caller] + creditOnlyFund[caller]) / 2);
        info.creditOnlyDrawn = Math.min(totalCredit, creditOnlyFund[caller]);
        info.earnedDrawn = totalCredit - info.creditOnlyDrawn;
        creditOnlyFund[caller] -= info.creditOnlyDrawn;
        earnedFund[caller] -= info.earnedDrawn;
        emit CreditSetAside(callId, info.creditOnlyDrawn, info.earnedDrawn);
        _emitFund(caller);
    }

    function _settleCopy(
        bytes32 callId, CallInfo storage info, uint256 index,
        Ending ending, Result memory result
    ) private returns (Payout memory payout) {
        CopyInfo storage copy = _copies[callId][index];
        uint256 callFee = copy.callFeeCash + copy.callFeeCredit;
        payout.cashBack = copy.callFeeCash + copy.platformFee;
        payout.creditBack = copy.callFeeCredit;

        if (ending == Ending.Right || ending == Ending.AboveEntry) {
            if (result.keptFee > callFee || (!result.filled && result.keptFee != 0)
                || result.creditAsk != 0) revert InvalidResult(callId, index);
            uint256 keptCredit = Math.min(result.keptFee, copy.callFeeCredit);
            uint256 keptCash = result.keptFee - keptCredit;
            payout.creditBack -= keptCredit;
            payout.cashBack -= keptCash;
            if (result.filled) {
                payout.cashBack -= copy.platformFee;
                payout.treasuryCash = copy.platformFee;
            }
            uint256 cut = Math.mulDiv(keptCash, info.shareBps,
                ending == Ending.Right ? BPS : 2 * BPS);
            payout.walletCash = cut + _addKept(info, keptCash - cut, keptCredit);
        } else if (ending == Ending.Wrong) {
            if (result.keptFee != 0
                || result.creditAsk > Math.mulDiv(copy.size, MAX_CREDIT_ASK_BPS, BPS) - callFee) {
                revert InvalidResult(callId, index);
            }
            // Subtract first to avoid overflow on a malicious posted ask sum.
            if (result.creditAsk > info.totalAsk - info.asksSeen) revert InvalidTotalAsk(callId, info.totalAsk - info.asksSeen, result.creditAsk);
            info.asksSeen += result.creditAsk;
            if (info.totalAsk != 0) {
                payout.newCredit = Math.mulDiv(result.creditAsk,
                    info.creditOnlyDrawn + info.earnedDrawn, info.totalAsk);
                info.creditHandedOut += payout.newCredit;
            }
        } else {
            if (result.keptFee != 0 || result.creditAsk != 0) revert InvalidResult(callId, index);
        }

        info.escrowCash -= copy.callFeeCash + copy.platformFee;
        info.escrowCredit -= copy.callFeeCredit;
        uint256 credit = payout.creditBack + payout.newCredit;
        creditBalance[copy.follower] += credit;
        creditReserve += credit;
        emit CopySettled(callId, index, copy.follower,
            payout.cashBack, payout.creditBack, payout.newCredit);
    }

    function _addKept(
        CallInfo storage info, uint256 earned, uint256 creditOnly
    ) private returns (uint256 overflow) {
        if (earned == 0 && creditOnly == 0) return 0;
        bytes32 caller = info.caller;
        earnedFund[caller] += earned;
        creditOnlyFund[caller] += creditOnly;
        uint256 limit = fundLimit(caller);
        if (earnedFund[caller] > limit) {
            overflow = earnedFund[caller] - limit;
            earnedFund[caller] = limit;
        }
        _emitFund(caller);
    }

    /// @notice After the grace period anyone can refund up to count remaining copies.
    /// @dev Already-settled copies retain their original result. count may exceed the remainder.
    function continueAsRefund(bytes32 callId, uint256 count) external nonReentrant {
        CallInfo storage info = _existingCall(callId);
        if (info.status == Status.Done) revert SettlementClosed(callId);
        if (block.timestamp < uint256(info.deadline) + REFUND_DELAY) revert TooEarly(uint256(info.deadline) + REFUND_DELAY);
        if (count > MAX_BATCH_SIZE || (count == 0 && info.copyCount != 0)) revert InvalidBatch(callId, count, info.copyCount - info.cursor);
        if (!info.expired) {
            if (info.status == Status.Open) _startSettlement(callId, info);
            info.expired = true;
            // Preserve the posted ending as history; every remaining copy uses Refund.
            if (!info.endingSet) {
                info.ending = Ending.Refund;
                info.endingSet = true;
            }
            _returnCredit(callId, info);
            emit Expired(callId, info.cursor);
        }
        uint256 from = info.cursor;
        count = Math.min(count, info.copyCount - from);
        Payout[] memory payouts = new Payout[](count);
        Result memory refund;
        for (uint256 i; i < count; ++i) {
            payouts[i] = _settleCopy(callId, info, from + i, Ending.Refund, refund);
        }
        info.cursor = from + count;
        if (info.cursor == info.copyCount) _finish(callId, info);
        emit BatchSettled(callId, from, info.cursor, Ending.Refund);
        _pushFollowers(callId, from, payouts);
    }

    function _finish(bytes32 callId, CallInfo storage info) private {
        _returnCredit(callId, info);
        info.status = Status.Done;
    }

    function _returnCredit(bytes32 callId, CallInfo storage info) private {
        if (info.creditReturned || !info.endingSet || info.ending != Ending.Wrong) return;
        info.creditReturned = true;
        // Issued credit consumes the credit-only slice before the earned slice.
        uint256 usedCreditOnly = Math.min(info.creditHandedOut, info.creditOnlyDrawn);
        uint256 toCreditOnly = info.creditOnlyDrawn - usedCreditOnly;
        uint256 toEarned = info.earnedDrawn - (info.creditHandedOut - usedCreditOnly);
        creditOnlyFund[info.caller] += toCreditOnly;
        earnedFund[info.caller] += toEarned;
        emit CreditReturned(callId, toCreditOnly, toEarned);
        _emitFund(info.caller);
    }

    function _pushFollowers(bytes32 callId, uint256 from, Payout[] memory payouts) private {
        for (uint256 i; i < payouts.length; ++i) {
            _push(_copies[callId][from + i].follower, payouts[i].cashBack);
        }
    }

    /// @dev A refusal is converted to an address-bound debt, never a failed batch.
    /// @dev All escrowed USDC, both caller funds (earned and credit-only), the credit reserve,
    /// and owed balances sit at the Hisaab address. If the USDC issuer blocklists Hisaab itself,
    /// no payout or claim can release funds. owed and claim only protect against a blocklisted
    /// recipient, not a frozen Hisaab. Operators should monitor the Hisaab address and have
    /// the owner pause new fee collection if it is frozen.
    function _push(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool success, bytes memory data) = address(usdc).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        bool transferred = success && address(usdc).code.length != 0
            && (data.length == 0 || (data.length == 32 && abi.decode(data, (uint256)) == 1));
        if (!transferred) {
            owed[to] += amount;
            emit PayoutOwed(to, amount);
        }
    }

    /// @notice Anyone may retry an owed payout, but only its recorded recipient is paid.
    /// @dev All escrowed USDC, both caller funds (earned and credit-only), the credit reserve,
    /// and owed balances sit at the Hisaab address. If the USDC issuer blocklists Hisaab itself,
    /// no payout or claim can release funds. owed and claim only protect against a blocklisted
    /// recipient, not a frozen Hisaab. Operators should monitor the Hisaab address and have
    /// the owner pause new fee collection if it is frozen.
    function claim(address to) external nonReentrant {
        uint256 amount = owed[to];
        if (amount == 0) revert NothingOwed(to);
        owed[to] = 0;
        usdc.safeTransfer(to, amount);
        emit Claimed(to, amount);
    }

    /// @notice Maximum earned fund; the production stub imposes no limit.
    function fundLimit(bytes32) public view virtual returns (uint256) {
        return type(uint256).max;
    }

    function getCall(bytes32 callId) external view returns (CallInfo memory) {
        return _existingCall(callId);
    }

    function getCopy(bytes32 callId, uint256 index) external view returns (CopyInfo memory) {
        return _copies[callId][index];
    }

    function cursor(bytes32 callId) external view returns (uint256) {
        return _existingCall(callId).cursor;
    }

    function checkFingerprint(bytes32 callId, bytes32 recordHash) external view returns (bool) {
        return recordHash != bytes32(0) && _calls[callId].fingerprint == recordHash;
    }

    /// @notice Unissued Wrong credit still held outside the funds and credit reserve.
    function creditSetAside(bytes32 callId) external view returns (uint256) {
        CallInfo storage info = _existingCall(callId);
        if (info.creditReturned) return 0;
        return info.creditOnlyDrawn + info.earnedDrawn - info.creditHandedOut;
    }

    function _existingCall(bytes32 callId) private view returns (CallInfo storage info) {
        info = _calls[callId];
        if (info.fingerprint == bytes32(0)) revert InvalidCall(callId);
    }

    function _emitFund(bytes32 caller) private {
        emit FundChanged(caller, earnedFund[caller], creditOnlyFund[caller]);
    }
}
