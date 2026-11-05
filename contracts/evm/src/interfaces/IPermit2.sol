// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The single-token signature-transfer slice of Permit2 used by Hisaab.
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;

    function nonceBitmap(address owner, uint256 wordPos) external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
