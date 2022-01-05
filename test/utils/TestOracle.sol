//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IOracle } from "../../contracts/interfaces/IOracle.sol";

contract TestOracle is IOracle {
    uint public price;

    function setPrice(uint _price) external {
        price = _price;
    }

    function fetchPrice() external view override returns (uint) {
        return price;
    }
}