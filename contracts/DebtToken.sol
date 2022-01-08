//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract DebtToken is ERC20, Ownable {
    constructor() ERC20("SIN USD", "SIN") {}

    /**
     * @notice mints new tokens to the _to address
     * @param _to address to receive the tokens
     * @param _amount number of tokens to recieve
     */
    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice burns _amount of msg.sender's tokens
     * @param _amount number of tokens to burn
     */
    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}
