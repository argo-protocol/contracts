// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC20/extensions/ERC20FlashMint.sol)

pragma solidity ^0.8.0;

import { IERC3156FlashBorrower } from "@openzeppelin/contracts/interfaces/IERC3156.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract TestFlashBorrower is IERC3156FlashBorrower {
    bool private approveFee;
    uint public lastAmount;
    uint public lastFee;
    bytes public lastData;

    constructor(bool _approveFee) {
        approveFee = _approveFee;
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        initiator; // no-op to remove warning
        lastData = data;
        lastAmount = amount;
        lastFee = fee;
        if (approveFee) {
            IERC20(token).approve(token, amount + fee);
        } else {
            IERC20(token).approve(token, amount);
        }
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}