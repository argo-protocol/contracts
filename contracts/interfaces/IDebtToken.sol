// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IDebtToken is IERC20Metadata {
    function mint(address _to, uint _amount) external;

    function burn(uint _amount) external;
}
