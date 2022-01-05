//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract DebtToken is ERC20, Ownable {
    constructor() ERC20("SIN", "SIN USD") {

    }

    function mint(address _to, uint _amount) external onlyOwner {
        _mint(_to, _amount);
    }
}

