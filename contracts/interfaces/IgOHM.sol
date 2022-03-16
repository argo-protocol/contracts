// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IgOHM is IERC20 {
    /**
        @notice converts OHM amount to gOHM
        @param _amount amount of gOHM
        @return amount of OHM
     */
    function balanceFrom(uint256 _amount) external view returns (uint256);
    function balanceTo(uint256 _amount) external view returns (uint256);
    function index() external view returns (uint);
}
