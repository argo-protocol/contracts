// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC4626 is IERC20 {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) ;
    function previewRedeem(uint256 shares) external view returns (uint256);
}