//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DebtToken is ERC20 {
    constructor() ERC20("SIN", "SIN USD") {}
}

