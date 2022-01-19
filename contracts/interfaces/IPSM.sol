// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPSM {
    function buyFee() external returns (uint256);
    function sellFee() external returns (uint256);
    function FEE_PRECISION() external returns (uint256);
    function buy(uint256 _amount) external;
    function sell(uint256 _amount) external;
}